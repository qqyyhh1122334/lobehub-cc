'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const test = require('node:test');
const { observeCapture, validateCaptureStatistics } = require('./capture-process.cjs');

function fixture(t, code, timeout = 5000) {
  const child = spawn(process.execPath, ['-e', code], { stdio: ['pipe', 'ignore', 'pipe'] });
  t.after(() => {
    child.stdin.destroy();
    child.kill('SIGKILL');
  });
  return { child, monitor: observeCapture(child, timeout) };
}
const summary = '0 packets captured\n0 packets received by filter\n0 packets dropped by kernel\n';
const successfulStop = `process.stdin.once('data', () => { process.stderr.write(${JSON.stringify(summary)}, () => process.exit(0)); });`;
const ready = "process.stderr.write('listening on test\\n');";

test('successful capture must remain alive until requested stop', async (t) => {
  const { child, monitor } = fixture(t, ready + successfulStop);
  await monitor.waitReady();
  await monitor.stop(() => child.stdin.write('stop'));
});

test('readiness marker split between chunks is recognized', async (t) => {
  const { child, monitor } = fixture(
    t,
    "process.stderr.write('listen'); setTimeout(() => process.stderr.write('ing on test\\n'), 30);" +
      successfulStop,
  );
  await monitor.waitReady();
  await monitor.stop(() => child.stdin.write('stop'));
});

test('nonzero stop exit fails even if a capture file could be empty', async (t) => {
  const { child, monitor } = fixture(
    t,
    ready + "process.stdin.once('data', () => process.exit(7));",
  );
  await monitor.waitReady();
  await assert.rejects(
    monitor.stop(() => child.stdin.write('stop')),
    /evidence is incomplete/,
  );
});

test('capture that exits during probes fails even with exit zero', async (t) => {
  const { child, monitor } = fixture(
    t,
    ready + "process.stdin.once('data', () => process.exit(0));",
  );
  await monitor.waitReady();
  const ended = once(child, 'exit');
  child.stdin.write('unexpected exit');
  await ended;
  let stopCalled = false;
  await assert.rejects(
    monitor.stop(() => {
      stopCalled = true;
    }),
    /before the probe window/,
  );
  assert.equal(stopCalled, false);
});

test('signal termination does not count as successful capture', async (t) => {
  const { child, monitor } = fixture(t, ready + 'setInterval(() => {}, 1000);');
  await monitor.waitReady();
  await assert.rejects(
    monitor.stop(() => child.kill('SIGTERM')),
    /evidence is incomplete/,
  );
});

test('startup failure is reported without waiting for readiness timeout', async (t) => {
  const { monitor } = fixture(t, 'process.exit(2);');
  await assert.rejects(monitor.waitReady(), /failed before readiness/);
});

test('startup without a readiness marker is bounded', async (t) => {
  const { monitor } = fixture(t, 'setInterval(() => {}, 1000);', 1000);
  await assert.rejects(monitor.waitReady(), /did not start/);
});

test('capture ignoring the stop request is bounded', async (t) => {
  const { monitor } = fixture(t, ready + 'setInterval(() => {}, 1000);', 1000);
  await monitor.waitReady();
  await assert.rejects(
    monitor.stop(() => {}),
    /did not stop/,
  );
});

test('final counters are returned only after stderr closes', async (t) => {
  const { child, monitor } = fixture(t, ready + successfulStop);
  await monitor.waitReady();
  assert.deepEqual(await monitor.stop(() => child.stdin.write('stop')), {
    captured: 0,
    received: 0,
    dropped: 0,
  });
});

test('exit zero without capture counters cannot prove zero egress', async (t) => {
  const { child, monitor } = fixture(
    t,
    ready + "process.stdin.once('data', () => process.exit(0));",
  );
  await monitor.waitReady();
  await assert.rejects(
    monitor.stop(() => child.stdin.write('stop')),
    /statistics missing or invalid/,
  );
});

test('kernel packet drops fail an otherwise successful capture', async (t) => {
  const code = successfulStop.replace('0 packets dropped', '1 packet dropped');
  const { child, monitor } = fixture(t, ready + code);
  await monitor.waitReady();
  await assert.rejects(
    monitor.stop(() => child.stdin.write('stop')),
    /dropped packets/,
  );
});

test('counter parser accepts Linux singular/plural output and preserves counters', () => {
  assert.deepEqual(
    validateCaptureStatistics(
      '1 packet captured\n2 packets received by filter\n0 packets dropped by kernel\n',
    ),
    {
      captured: 1,
      received: 2,
      dropped: 0,
    },
  );
});

test('missing, malformed, duplicate and overflowing counters fail closed', () => {
  for (const value of [
    '',
    summary.replace('0 packets captured\n', ''),
    summary.replace('0 packets captured', '-1 packets captured'),
    summary + '0 packets dropped by kernel\n',
    summary.replace('0 packets received', '9007199254740992 packets received'),
  ])
    assert.throws(() => validateCaptureStatistics(value), /statistics missing or invalid/);
});
