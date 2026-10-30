'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const test = require('node:test');
const { runCommand } = require('./command.cjs');

test('command input/output is preserved on success', () => {
  assert.equal(runCommand(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'],
    { input: 'fixture input', stage: 'fixture', timeoutMs: 2000 }), 'fixture input');
});
test('a stalled command is forcibly bounded and never passes', () => {
  const started = Date.now();
  assert.throws(() => runCommand(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
    { stage: 'stalled-fixture', timeoutMs: 100 }), error => {
      assert.equal(error.code, 'INTRANET_COMMAND_TIMEOUT');
      assert.equal(error.stage, 'stalled-fixture');
      assert.match(error.message, /termination and cleanup are unconfirmed/);
      return true;
    });
  assert(Date.now() - started < 3000);
});
test('command failures do not expose command arguments, captured output or underlying error', () => {
  assert.throws(() => runCommand(process.execPath,
    ['-e', "console.log('PRIVATE_STDOUT');console.error('PRIVATE_STDERR');process.exit(7)", 'PRIVATE_ARGUMENT'],
    { stage: 'fixture', timeoutMs: 2000 }), error => {
      assert.equal(error.message, 'fixture failed (exit 7)');
      assert.equal(error.code, 'INTRANET_COMMAND_FAILED');
      assert(!JSON.stringify(error).includes('PRIVATE'));
      assert(!String(error.stack).includes('PRIVATE'));
      assert.equal(error.cause, undefined);
      return true;
    });
});
test('missing executables and invalid deadlines fail explicitly', () => {
  assert.throws(() => runCommand('/missing-intranet-fixture', [], { stage: 'fixture' }), /exit unavailable/);
  for (const timeoutMs of [0, -1, NaN, Infinity])
    assert.throws(() => runCommand(process.execPath, [], { timeoutMs }), /deadline/);
});
test('the in-container deadline independently terminates a stalled probe with failure', () => {
  const result = spawnSync(process.execPath, ['-e',
    `require(${JSON.stringify(join(__dirname, 'probe-deadline.cjs'))}).armProbeDeadline(50);setInterval(()=>{},1000)`],
  { encoding: 'utf8', timeout: 2000 });
  assert.equal(result.status, 1);
  assert.equal(result.signal, null);
  assert.match(result.stderr, /timed out.*cleanup are unconfirmed/);
});
test('completed probes disarm the deadline', () => {
  const result = spawnSync(process.execPath, ['-e',
    `const clear=require(${JSON.stringify(join(__dirname, 'probe-deadline.cjs'))}).armProbeDeadline(20);clear();setTimeout(()=>console.log('finished'),60)`],
  { encoding: 'utf8', timeout: 2000 });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'finished');
  assert.equal(result.stderr, '');
});
