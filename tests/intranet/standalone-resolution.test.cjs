'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const hook = path.resolve(__dirname, 'standalone-resolution.cjs');
function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobehub-module-boundary-'));
  const runtime = path.join(directory, 'runtime');
  fs.mkdirSync(runtime);
  const internal = path.join(runtime, 'inside.cjs');
  const outside = path.join(directory, 'outside.cjs');
  fs.writeFileSync(internal, 'module.exports = 42;');
  fs.writeFileSync(outside, 'module.exports = 99;');
  const execute = (source) =>
    spawnSync(process.execPath, ['--require', hook, '-e', source], {
      cwd: runtime,
      env: { PATH: process.env.PATH, INTRANET_SMOKE_RUNTIME_ROOT: runtime },
      encoding: 'utf8',
    });
  try {
    run({ execute, internal, outside, runtime });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
test('isolated standalone can load its own files and Node built-ins', () =>
  fixture(({ execute, internal }) => {
    const result = execute(
      `require('node:assert/strict').equal(require(${JSON.stringify(internal)}),42)`,
    );
    assert.equal(result.status, 0, result.stderr);
  }));
test('isolated standalone rejects CJS fallback and escaping symlinks', () =>
  fixture(({ execute, outside, runtime }) => {
    const link = path.join(runtime, 'escape.cjs');
    fs.symlinkSync(outside, link);
    for (const target of [outside, link]) {
      const result = execute(`require(${JSON.stringify(target)})`);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Standalone dependency escaped runtime/);
    }
  }));
test('isolated standalone rejects ESM fallback outside the runtime tree', () =>
  fixture(({ execute, outside }) => {
    const result = execute(`import(${JSON.stringify(pathToFileURL(outside).href)})`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Standalone dependency escaped runtime/);
  }));
