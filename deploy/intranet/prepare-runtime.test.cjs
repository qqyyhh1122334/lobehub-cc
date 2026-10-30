'use strict';

const assert = require('node:assert/strict');
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require('node:fs');
const { createRequire } = require('node:module');
const { tmpdir } = require('node:os');
const { dirname, join, relative } = require('node:path');
const test = require('node:test');
const { prepareRuntime, resolvePackageDirectory } = require('./prepare-runtime.cjs');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'intranet-runtime-fixture-'));
  const destination = join(root, 'standalone');
  mkdirSync(destination);
  writeFileSync(join(root, 'package.json'), '{"private":true}');
  writeFileSync(join(destination, 'package.json'), '{"private":true}');
  writeFileSync(join(destination, 'server.js'), '// fixture server');
  function pkg(locator, name, version, source = 'module.exports = true;', metadata = {}) {
    const context = join(root, 'node_modules/.pnpm', locator, 'node_modules');
    const dir = join(context, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name, version, main: 'index.cjs', ...metadata }),
    );
    writeFileSync(join(dir, 'index.cjs'), source);
    return { dir, context, name };
  }
  function link(context, name, dependency) {
    const target = join(context, name);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(relative(dirname(target), dependency.dir), target, 'dir');
  }
  return {
    root,
    destination,
    pkg,
    link,
    entry: (name, dependency) => link(join(root, 'node_modules'), name, dependency),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('vendor graph preserves conflicting versions and equal-version packages with distinct peer contexts', () => {
  const f = fixture();
  try {
    const v1 = f.pkg('shared@1', 'shared', '1.0.0', "module.exports='one';");
    const v2 = f.pkg('shared@2', 'shared', '2.0.0', "module.exports='two';");
    const wrong = f.pkg(
      'shared@999',
      'shared',
      '999.0.0',
      "throw new Error('Builder fallback used');",
    );
    f.entry('shared', wrong);
    const a = f.pkg('adapter@1_shared@1', 'adapter', '1.0.0', "module.exports=require('shared');", {
      peerDependencies: { shared: '*' },
      exports: { '.': './index.cjs' },
    });
    const b = f.pkg('adapter@1_shared@2', 'adapter', '1.0.0', "module.exports=require('shared');", {
      peerDependencies: { shared: '*' },
      exports: { '.': './index.cjs' },
    });
    f.link(a.context, 'shared', v1);
    f.link(b.context, 'shared', v2);
    const left = f.pkg(
      'left@1',
      'left',
      '1.0.0',
      "require('node:assert/strict').equal(require('adapter'),'one');module.exports=require('adapter');",
      { dependencies: { adapter: '1.0.0' } },
    );
    const right = f.pkg(
      'right@1',
      'right',
      '1.0.0',
      "require('node:assert/strict').equal(require('adapter'),'two');module.exports=require('adapter');",
      { dependencies: { adapter: '1.0.0' } },
    );
    f.link(left.context, 'adapter', a);
    f.link(right.context, 'adapter', b);
    f.entry('left', left);
    f.entry('right', right);
    assert.throws(
      () => createRequire(join(left.dir, 'index.cjs')).resolve('adapter/package.json'),
      { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' },
    );
    assert.equal(resolvePackageDirectory('adapter', left.dir), a.dir);
    const options = {
      root: f.root,
      destination: f.destination,
      packageNames: ['left', 'right'],
      validationModules: ['left', 'right'],
      verificationStdio: 'pipe',
    };
    assert.equal(prepareRuntime(options), 6);
    // Re-running replaces the vendor graph safely and does not flatten peers.
    assert.equal(prepareRuntime(options), 6);
    const load = createRequire(join(f.destination, 'package.json'));
    assert.equal(load('left'), 'one');
    assert.equal(load('right'), 'two');
    const manifest = JSON.parse(
      readFileSync(join(f.destination, 'intranet-runtime-dependencies.json')),
    );
    const adapters = manifest.packages.filter((item) => item.name === 'adapter');
    assert.equal(adapters.length, 2);
    assert.notEqual(adapters[0].id, adapters[1].id);
    assert(!manifest.packages.some((item) => item.version === '999.0.0'));
    assert(
      !readdirSync(join(f.destination, 'node_modules')).some((name) => name.includes('-stage-')),
    );
  } finally {
    f.cleanup();
  }
});

test('dependency cycles are packaged once and absent optional dependencies remain absent', () => {
  const f = fixture();
  try {
    const a = f.pkg(
      'cycle-a@1',
      'cycle-a',
      '1.0.0',
      "exports.name='A';exports.peer=require('cycle-b').name;",
      { dependencies: { 'cycle-b': '*' }, optionalDependencies: { absent: '*' } },
    );
    const b = f.pkg(
      'cycle-b@1',
      'cycle-b',
      '1.0.0',
      "exports.name='B';exports.peer=require('cycle-a').name;",
      { dependencies: { 'cycle-a': '*' } },
    );
    f.link(a.context, 'cycle-b', b);
    f.link(b.context, 'cycle-a', a);
    f.entry('cycle-a', a);
    assert.equal(
      prepareRuntime({
        root: f.root,
        destination: f.destination,
        packageNames: ['cycle-a'],
        validationModules: ['cycle-a'],
        verificationStdio: 'pipe',
      }),
      2,
    );
    const load = createRequire(join(f.destination, 'package.json'));
    assert.deepEqual(load('cycle-a'), { name: 'A', peer: 'B' });
  } finally {
    f.cleanup();
  }
});

test('a missing required dependency fails before changing the previous standalone entry', () => {
  const f = fixture();
  try {
    const entry = f.pkg('entry@1', 'entry', '1.0.0', 'module.exports=true;', {
      dependencies: { missing: '*' },
    });
    f.entry('entry', entry);
    const old = join(f.destination, 'node_modules/entry');
    mkdirSync(old, { recursive: true });
    writeFileSync(join(old, 'marker'), 'keep');
    assert.throws(
      () =>
        prepareRuntime({
          root: f.root,
          destination: f.destination,
          packageNames: ['entry'],
          validationModules: ['entry'],
          verificationStdio: 'pipe',
        }),
      /Missing installed runtime dependency missing/,
    );
    assert.equal(readFileSync(join(old, 'marker'), 'utf8'), 'keep');
    assert(existsSync(join(f.destination, 'server.js')));
    assert(
      !readdirSync(f.destination).some((name) => name.startsWith('.intranet-runtime-backup-')),
    );
  } finally {
    f.cleanup();
  }
});

test('isolated verification rejects undeclared builder escapes and restores the old output', () => {
  const f = fixture();
  try {
    const outside = join(f.root, 'builder-only.cjs');
    writeFileSync(outside, 'module.exports=true;');
    const entry = f.pkg(
      'entry@1',
      'entry',
      '1.0.0',
      `module.exports=require(${JSON.stringify(outside)});`,
    );
    f.entry('entry', entry);
    const old = join(f.destination, 'node_modules/entry');
    mkdirSync(old, { recursive: true });
    writeFileSync(join(old, 'marker'), 'restore');
    assert.throws(
      () =>
        prepareRuntime({
          root: f.root,
          destination: f.destination,
          packageNames: ['entry'],
          validationModules: ['entry'],
          verificationStdio: 'pipe',
        }),
      /Runtime dependency escaped standalone/,
    );
    assert.equal(readFileSync(join(old, 'marker'), 'utf8'), 'restore');
    assert(existsSync(join(f.destination, 'server.js')));
    assert(!existsSync(join(f.destination, 'node_modules/.intranet-runtime')));
  } finally {
    f.cleanup();
  }
});

test('isolated verification also rejects ESM imports outside standalone', () => {
  const f = fixture();
  try {
    const outside = join(f.root, 'builder-only.mjs');
    writeFileSync(outside, 'export default true;');
    const entry = f.pkg('esm-entry@1', 'esm-entry', '1.0.0', '', {
      main: 'index.mjs',
      type: 'module',
    });
    writeFileSync(
      join(entry.dir, 'index.mjs'),
      `import value from ${JSON.stringify(outside)}; export default value;`,
    );
    f.entry('esm-entry', entry);
    assert.throws(
      () =>
        prepareRuntime({
          root: f.root,
          destination: f.destination,
          packageNames: ['esm-entry'],
          validationModules: ['esm-entry'],
          verificationStdio: 'pipe',
        }),
      /Runtime dependency escaped standalone/,
    );
    assert(existsSync(join(f.destination, 'server.js')));
    assert(!existsSync(join(f.destination, 'node_modules/.intranet-runtime')));
  } finally {
    f.cleanup();
  }
});
