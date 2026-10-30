import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observeCapture } from './capture-process.cjs';
import { runCommand } from './command.cjs';

const dir = dirname(fileURLToPath(import.meta.url));
const docker = (args, input, options = {}) =>
  runCommand('docker', args, { cwd: dir, input, ...options });
const compose = (...args) => docker(['compose', '-f', 'compose.yaml', ...args]);
const output = { startedAt: new Date().toISOString(), status: 'failed', stages: [] };
const record = (stage) => {
  output.stages.push(stage);
  console.log(`PASS ${stage}`);
};
let capture;
try {
  assert(
    process.env.INTRANET_TEST_EMAIL && process.env.INTRANET_TEST_PASSWORD?.length >= 16,
    'Set INTRANET_TEST_EMAIL (new allowed account) and INTRANET_TEST_PASSWORD (16+ chars)',
  );
  for (const path of [
    '.env',
    'certs/ca.pem',
    'certs/cert.pem',
    'certs/key.pem',
    'model-data/models',
  ])
    assert(existsSync(join(dir, path)), `Missing prerequisite: ${path}`);
  const keyPermissions = statSync(join(dir, 'certs/key.pem'));
  assert(!(keyPermissions.mode & 0o007), 'TLS private key must not be accessible to other users');
  assert(
    (keyPermissions.uid === 101 && keyPermissions.mode & 0o400) ||
      (keyPermissions.gid === 101 && keyPermissions.mode & 0o040),
    'TLS key must be readable by nginx UID/GID101; set owner root:101 and chmod0640',
  );
  for (const cert of ['ca.pem', 'cert.pem'])
    assert(
      statSync(join(dir, 'certs', cert)).mode & 0o004,
      `Set certs/${cert} mode0644 so the service users can read it`,
    );
  const config = JSON.parse(compose('config', '--format', 'json'));
  assert.equal(config.networks.backend.internal, true);
  for (const service of Object.values(config.services)) assert.equal(service.pull_policy, 'never');
  const manifest = JSON.parse(
    readFileSync(resolve(process.argv[2] || join(dir, 'bundle/manifest.json')), 'utf8'),
  );
  assert.equal(manifest.schema, 1, 'Unexpected bundle schema');
  assert.equal(
    manifest.baseCommit,
    '049c81d53b0c2282eabf1edca2d90d58ad1f60f0',
    'Unexpected source baseline',
  );
  for (const service of Object.values(config.services)) {
    const expected = manifest.images.find((image) => image.tag === service.image);
    assert(expected, `Image not in exported manifest: ${service.image}`);
    const [actual] = JSON.parse(docker(['image', 'inspect', service.image]));
    assert.equal(actual.Id, expected.id, `Image ID mismatch: ${service.image}`);
  }
  record('compose-and-immutable-images');
  docker(['compose', '-f', 'compose.yaml', 'up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '300'],
    undefined, { stage: 'compose-startup', timeoutMs: 360_000 });
  compose('exec', '-T', 'network-policy', '/bin/sh', '/policy/check.sh');
  const policyNamespace = compose(
    'exec',
    '-T',
    'network-policy',
    'readlink',
    '/proc/self/ns/net',
  ).trim();
  assert.equal(
    compose('exec', '-T', 'nginx', 'readlink', '/proc/self/ns/net').trim(),
    policyNamespace,
    'nginx and policy are in different namespaces; recreate the stack',
  );
  assert.equal(
    compose(
      'exec',
      '-T',
      'app',
      'node',
      '-e',
      "console.log(require('node:fs').readlinkSync('/proc/self/ns/net'))",
    ).trim(),
    policyNamespace,
    'app and policy are in different namespaces; recreate the stack',
  );
  record('startup-and-firewall');
  const before = compose('exec', '-T', 'network-policy', 'iptables', '-nvxL', 'OUTPUT');
  const [policyInfo] = JSON.parse(
    docker(['inspect', compose('ps', '-q', 'network-policy').trim()]),
  );
  const sourceIPs = Object.values(policyInfo.NetworkSettings.Networks)
    .map((network) => network.IPAddress)
    .filter(Boolean);
  assert(
    sourceIPs.length === 2 && sourceIPs.every((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)),
    'Unexpected firewall namespace addresses',
  );
  const sources = sourceIPs.map((ip) => `src host ${ip}`).join(' or ');
  const allowedDestinations = [
    'dst net 127.0.0.0/8',
    '(dst host 172.30.90.10 and tcp dst port 5432)',
    '(dst host 172.30.90.11 and tcp dst port 6379)',
    '(dst host 172.30.90.12 and tcp dst port 9000)',
    '(dst host 172.30.90.13 and tcp dst port 11434)',
    '(dst host 172.30.90.53 and dst port 53)',
  ].join(' or ');
  const filter = `((${sources}) and not (${allowedDestinations})) or ip6`;
  capture = spawn(
    'docker',
    [
      'compose',
      '-f',
      'compose.yaml',
      'exec',
      '-T',
      'network-policy',
      '/bin/sh',
      '-c',
      'export LC_ALL=C; echo $$ >/run/capture.pid; shift; exec tcpdump -U -n -i any -w /run/egress.pcap "$1"',
      'capture',
      'filter',
      filter,
    ],
    { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const captureMonitor = observeCapture(capture);
  await captureMonitor.waitReady();
  const network = docker(
    ['compose', '-f', 'compose.yaml', 'exec', '-T', '-e', 'NODE_OPTIONS=', 'app', 'node', '-'],
    readFileSync(join(dir, 'probe-network.cjs'), 'utf8'),
    { stage: 'kernel-network-probe', timeoutMs: 30_000 },
  );
  const application = docker(
    [
      'compose',
      '-f',
      'compose.yaml',
      'exec',
      '-T',
      '-e',
      'INTRANET_TEST_EMAIL',
      '-e',
      'INTRANET_TEST_PASSWORD',
      'app',
      'node',
      '-',
    ],
    readFileSync(join(dir, 'probe-app.cjs'), 'utf8'),
    { stage: 'application-probe', timeoutMs: 720_000 },
  );
  output.captureStatistics = await captureMonitor.stop(() =>
    compose('exec', '-T', 'network-policy', '/bin/sh', '-c', 'kill -INT "$(cat /run/capture.pid)"'),
  );
  capture = undefined;
  const leakedPackets = compose(
    'exec',
    '-T',
    'network-policy',
    'tcpdump',
    '-n',
    '-r',
    '/run/egress.pcap',
  );
  assert.equal(leakedPackets.trim(), '', 'Unexpected external packet reached a network interface');
  const after = compose('exec', '-T', 'network-policy', 'iptables', '-nvxL', 'OUTPUT');
  const rejects = (text) =>
    Number(
      text
        .split('\n')
        .find((line) => /\bREJECT\b/.test(line))
        ?.trim()
        .split(/\s+/)[0],
    );
  assert(
    rejects(after) > rejects(before),
    'No kernel rejection counter increment; probe is inconclusive',
  );
  output.network = JSON.parse(network.trim());
  record('kernel-egress-dns-and-zero-packets');
  output.application = JSON.parse(application.trim());
  record('password-auth-model-migrations-storage');
  output.status = 'passed';
} catch (error) {
  // Docker config contains secrets: never print its captured stdout or stderr.
  output.error =
    error instanceof assert.AssertionError ? error.message : error.message.split('\n')[0];
  if (error.code === 'INTRANET_COMMAND_TIMEOUT') output.commandFailure = {
    stage: error.stage, timeoutMs: error.timeoutMs, timedOut: true,
    containerTermination: 'unconfirmed', cleanup: 'unconfirmed',
  };
  console.error(`Acceptance FAILED: ${output.error}`);
  process.exitCode = 1;
} finally {
  if (capture) {
    try {
      compose(
        'exec',
        '-T',
        'network-policy',
        '/bin/sh',
        '-c',
        'kill -INT "$(cat /run/capture.pid)"',
      );
    } catch {
      /* namespace may have stopped */
    }
    capture.kill();
  }
  output.finishedAt = new Date().toISOString();
  const report = join(dir, `acceptance-${Date.now()}.json`);
  writeFileSync(report, JSON.stringify(output, null, 2) + '\n', { mode: 0o600 });
  console.log(`Evidence: ${report}`);
}
