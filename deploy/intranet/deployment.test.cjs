'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { validateAllowedEmails, validateEnv } = require('./validate-env.cjs');

const valid = {
  HOSTNAME: '127.0.0.1',
  PORT: '3210',
  APP_URL: 'https://lobehub.internal:8443',
  AUTH_SECRET: 'a'.repeat(64),
  KEY_VAULTS_SECRET: Buffer.alloc(32, 5).toString('base64'),
  S3_SECRET_ACCESS_KEY: 'c'.repeat(64),
  S3_ACCESS_KEY_ID: 'local-key',
  AUTH_ALLOWED_EMAILS: 'tester@corp.internal',
  OLLAMA_MODEL_LIST: 'qwen3:8b,bge-m3',
  DATABASE_URL: 'postgresql://postgres:secret@172.30.90.10:5432/lobehub',
  REDIS_URL: 'redis://172.30.90.11:6379',
  OLLAMA_PROXY_URL: 'http://172.30.90.13:11434',
  S3_ENDPOINT: 'https://lobehub.internal:8443',
  S3_BUCKET: 'lobehub-files',
  AUTH_DISABLE_EMAIL_PASSWORD: '0',
  AUTH_EMAIL_VERIFICATION: '0',
  AUTH_ENABLE_MAGIC_LINK: '0',
};
test('isolated runtime environment is accepted', () => assert.equal(validateEnv(valid), true));
test('the real network guard allows loopback listening and rejects wildcard binding', () => {
  for (const host of ['0.0.0.0', '::', '172.30.90.2'])
    assert.throws(() => validateEnv({ ...valid, HOSTNAME: host }), /must listen on 127.0.0.1:3210/);
  const env = {
    ...process.env,
    LOBE_INTRANET_ALLOWED_ENDPOINTS: '127.0.0.1:3210',
    NODE_OPTIONS: '',
  };
  for (const name of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
  ])
    env[name] = '';
  const output = execFileSync(
    process.execPath,
    [
      '--require',
      join(__dirname, '../../scripts/intranet/network-guard.cjs'),
      '-e',
      `
    const assert=require('node:assert/strict'),net=require('node:net');
    (async()=>{
      await new Promise((resolve,reject)=>{
        const server=net.createServer();server.once('error',reject);
        server.listen(0,'127.0.0.1',()=>{
          assert.equal(server.address().address,'127.0.0.1');
          server.close(resolve);
        });
      });
      await new Promise((resolve,reject)=>{
        const server=net.createServer();
        server.once('error',error=>{try{assert.equal(error.code,'LOBE_INTRANET_EGRESS_DENIED');resolve();}catch(e){reject(e)}});
        server.listen(0,'0.0.0.0',()=>server.close(()=>reject(new Error('Unexpected wildcard listener'))));
      });
      console.log('loopback-listen-passed-and-wildcard-denied');
    })().catch(error=>{console.error(error.message);process.exitCode=1});
  `,
    ],
    { env, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(output.trim(), 'loopback-listen-passed-and-wildcard-denied');
});
test('empty or malformed email allowlists never become allow-all signup', () => {
  for (const input of ['', ',', ' , ', 'bad@@domain', 'example.com,', '@example.com', 'no-domain'])
    assert.throws(() => validateAllowedEmails(input), /valid, nonempty/);
  assert(validateAllowedEmails('alice@corp.internal,bob@corp.internal'));
  assert(validateAllowedEmails('corp.internal'));
});
test('each missing startup prerequisite fails closed', () => {
  for (const key of [
    'APP_URL',
    'DATABASE_URL',
    'AUTH_SECRET',
    'KEY_VAULTS_SECRET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'AUTH_ALLOWED_EMAILS',
    'OLLAMA_MODEL_LIST',
  ]) {
    const env = { ...valid };
    delete env[key];
    assert.throws(() => validateEnv(env), /Required/);
  }
});
test('weak and placeholder secrets are rejected', () => {
  for (const name of ['AUTH_SECRET', 'KEY_VAULTS_SECRET', 'S3_SECRET_ACCESS_KEY']) {
    assert.throws(() => validateEnv({ ...valid, [name]: 'short' }), /unique random secret/);
    assert.throws(
      () => validateEnv({ ...valid, [name]: 'build-placeholder-not-a-runtime-secret' }),
      /unique random secret/,
    );
  }
  assert.throws(
    () => validateEnv({ ...valid, KEY_VAULTS_SECRET: 'a'.repeat(64) }),
    /base64 encoding/,
  );
});
test('external endpoints, bad origins, and storage prefix rewrites fail closed', () => {
  for (const [key, value] of Object.entries({
    APP_URL: 'http://lobehub.internal:8443',
    DATABASE_URL: 'postgresql://user:password@db.example.com:5432/lobehub',
    REDIS_URL: 'redis://redis.example.com:6379',
    OLLAMA_PROXY_URL: 'https://ollama.com',
    S3_ENDPOINT: 'https://lobehub.internal:8443/storage',
    S3_BUCKET: 'other',
  })) {
    assert.throws(() => validateEnv({ ...valid, [key]: value }));
  }
});
test('all proxy variants and external identity modes are rejected', () => {
  for (const name of [
    'PROXY_URL',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'AUTH_SSO_PROVIDERS',
  ])
    assert.throws(() => validateEnv({ ...valid, [name]: 'configured' }), /Not supported/);
  for (const name of [
    'AUTH_DISABLE_EMAIL_PASSWORD',
    'AUTH_EMAIL_VERIFICATION',
    'AUTH_ENABLE_MAGIC_LINK',
  ])
    assert.throws(() => validateEnv({ ...valid, [name]: '1' }), /local password/);
});
test('configuration generates independent secrets privately, never overwrites, and rejects DNS injection', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lobe-config-'));
  try {
    cpSync(join(__dirname, 'configure.mjs'), join(dir, 'configure.mjs'));
    cpSync(join(__dirname, 'validate-env.cjs'), join(dir, 'validate-env.cjs'));
    const output = execFileSync(process.execPath, [
      join(dir, 'configure.mjs'),
      '--emails',
      'tester@corp.internal',
    ]);
    const env = readFileSync(join(dir, '.env'), 'utf8');
    assert.equal(statSync(join(dir, '.env')).mode & 0o777, 0o600);
    const values = Object.fromEntries(
      env
        .trim()
        .split('\n')
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
    const secrets = [
      'AUTH_SECRET',
      'KEY_VAULTS_SECRET',
      'POSTGRES_PASSWORD',
      'S3_SECRET_ACCESS_KEY',
    ].map((key) => values[key]);
    assert.equal(new Set(secrets).size, secrets.length);
    for (const secret of secrets) assert(!output.includes(secret));
    for (const name of ['AUTH_SECRET', 'POSTGRES_PASSWORD', 'S3_SECRET_ACCESS_KEY'])
      assert.match(values[name], /^[a-f0-9]{64}$/);
    assert.equal(Buffer.from(values.KEY_VAULTS_SECRET, 'base64').length, 32);
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [join(dir, 'configure.mjs'), '--emails', 'tester@corp.internal'],
        { stdio: 'ignore' },
      ),
    );
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [
          join(dir, 'configure.mjs'),
          '--host',
          'example.com\nforward . 8.8.8.8',
          '--emails',
          'tester@corp.internal',
        ],
        { stdio: 'ignore' },
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('default Dockerfile and dedicated isolated Dockerfile cannot drift', () => {
  assert.equal(
    readFileSync(join(__dirname, '../../Dockerfile'), 'utf8'),
    readFileSync(join(__dirname, '../../Dockerfile.intranet'), 'utf8'),
  );
  const dockerfile = readFileSync(join(__dirname, '../../Dockerfile'), 'utf8');
  assert(dockerfile.includes('HOSTNAME=127.0.0.1'));
  const manifest = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
  for (const script of ['start', 'dev:next']) {
    assert(manifest.scripts[script].includes('--require ./scripts/intranet/network-guard.cjs'));
    assert(manifest.scripts[script].includes('-H 127.0.0.1'));
  }
  assert.equal(manifest.scripts['dev:bun'], 'pnpm run dev:next');
});
test('offline import verifies digest before loading and runtime contains no package install', () => {
  const importer = readFileSync(join(__dirname, 'import-offline.mjs'), 'utf8');
  assert(importer.indexOf('checksum mismatch') < importer.indexOf("docker('image', 'load'"));
  const runtime = readFileSync(join(__dirname, '../../Dockerfile'), 'utf8').split('AS runtime')[1];
  assert(!/\b(?:npm|pnpm|apt|apk)\b.*(?:install|add|update)/.test(runtime));
  assert(runtime.includes('network-guard.cjs'));
});
test('firewall health fails on injected ACCEPT rules using the real shell scripts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lobe-firewall-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const fake = `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const file=path.join(process.env.FAKE_POLICY_DIR,path.basename(process.argv[1])+'.json');
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{policies:{},rules:{}};
const [op,chain,...rest]=process.argv.slice(2);
if(op==='-P')state.policies[chain]=rest[0];
else if(op==='-F')state.rules[chain]=[];
else if(op==='-A')(state.rules[chain]??=[]).push('-A '+chain+' '+rest.join(' '));
else if(op==='-C'){if(!(state.rules[chain]||[]).includes('-A '+chain+' '+rest.join(' ')))process.exit(1);}
else if(op==='-S')console.log(['-P '+chain+' '+state.policies[chain],...(state.rules[chain]||[])].join('\\n'));
else process.exit(2);
fs.writeFileSync(file,JSON.stringify(state));
`;
    writeFileSync(join(bin, 'iptables'), fake, { mode: 0o755 });
    writeFileSync(join(bin, 'ip6tables'), fake, { mode: 0o755 });
    writeFileSync(
      join(bin, 'tail'),
      '#!/bin/sh\nif [ "$1" = "-f" ]; then exit 0; fi\nexec /usr/bin/tail "$@"\n',
      { mode: 0o755 },
    );
    for (const name of ['firewall.sh', 'check.sh'])
      writeFileSync(
        join(dir, name),
        readFileSync(join(__dirname, name), 'utf8').replaceAll(
          '/run/policy-ready',
          join(dir, 'policy-ready'),
        ),
      );
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_POLICY_DIR: dir };
    execFileSync('/bin/sh', [join(dir, 'firewall.sh')], { env });
    execFileSync('/bin/sh', [join(dir, 'check.sh')], { env });
    const statePath = join(dir, 'iptables.json');
    const state = JSON.parse(readFileSync(statePath));
    state.rules.OUTPUT.unshift('-A OUTPUT -j ACCEPT');
    writeFileSync(statePath, JSON.stringify(state));
    assert.throws(() => execFileSync('/bin/sh', [join(dir, 'check.sh')], { env, stdio: 'ignore' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
