'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const test = require('node:test');
const { createBuildEnv, createBuildPlan, runBuild } = require('./build.cjs');

test('build environment discards runtime endpoints, proxy settings and NODE_OPTIONS overrides', () => {
  const env = createBuildEnv({
    NODE_OPTIONS: '--require=/untrusted/hook.js',
    HTTP_PROXY: 'http://proxy:8080',
    HTTPS_PROXY: 'http://proxy:8080',
    ALL_PROXY: 'socks5://proxy:1080',
    http_proxy: 'proxy',
    https_proxy: 'proxy',
    all_proxy: 'proxy',
    LOBE_INTRANET_ALLOWED_ENDPOINTS: 'internal:1234',
    RAYON_NUM_THREADS: '999',
    MOBILE: 'true',
  });
  for (const name of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'LOBE_INTRANET_ALLOWED_ENDPOINTS',
  ])
    assert.equal(env[name], '');
  assert(!env.NODE_OPTIONS.includes('untrusted'));
  assert(env.NODE_OPTIONS.includes('--max-old-space-size=4400'));
  assert(env.NODE_OPTIONS.includes('network-guard.cjs'));
  assert.equal(env.RAYON_NUM_THREADS, '2');
  assert.equal(env.UV_THREADPOOL_SIZE, '2');
  assert.equal(env.MOBILE, 'false');
  assert.equal(env.NEXT_TELEMETRY_DISABLED, '1');
  assert.equal(createBuildEnv({}, { MOBILE: 'true' }).MOBILE, 'true');
});

test('memory settings and build modes fail closed on invalid input', () => {
  for (const value of ['0', '-1', '9999999', '4400 --require=x', '1.5'])
    assert.throws(() => createBuildEnv({ LOBE_BUILD_HEAP_MB: value }), /must be an integer/);
  assert(createBuildEnv({ LOBE_BUILD_HEAP_MB: '4096' }).NODE_OPTIONS.includes('4096'));
  assert.throws(() => createBuildPlan('unknown'), /Unknown build mode/);
  assert.throws(
    () => createBuildPlan('next', '/tmp', ['--experimental-build-mode=compile']),
    /Only/,
  );
  assert.deepEqual(createBuildPlan('next', '/tmp', ['--webpack'])[0].args.slice(-2), [
    'build',
    '--webpack',
  ]);
  assert.deepEqual(createBuildPlan('next', '/tmp')[0].args.slice(-2), ['build', '--webpack']);
  const finalStep = createBuildPlan('all', '/tmp').at(-1);
  assert.deepEqual(finalStep.args.slice(-2), ['build', '--webpack']);
  const repeated = createBuildPlan('next', '/tmp', ['--webpack', '--debug', '--webpack'])[0].args;
  assert.equal(repeated.filter((argument) => argument === '--webpack').length, 1);
  assert.deepEqual(repeated.slice(-3), ['build', '--webpack', '--debug']);
});

test('real Node subprocess preloads guard and blocks public requests without DNS or network', () => {
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      `
    const assert=require('node:assert/strict');
    assert(globalThis[Symbol.for('lobehub.intranet.guard')]);
    fetch('https://build-probe.example.com').then(()=>process.exit(2),error=>{
      assert.equal(error.code,'LOBE_INTRANET_EGRESS_DENIED');
      console.log('guard-active-and-public-request-denied');
    });
  `,
    ],
    { env: createBuildEnv(process.env), encoding: 'utf8' },
  );
  assert.equal(output.trim(), 'guard-active-and-public-request-denied');
});

test('the installed Next worker preserves the guard after rewriting NODE_OPTIONS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lobe-next-worker-'));
  try {
    const worker = join(dir, 'worker.cjs');
    writeFileSync(
      worker,
      `exports.probe=async()=>{try{await fetch('https://next-worker-probe.example.com');return {denied:false};}catch(error){return {guard:!!globalThis[Symbol.for('lobehub.intranet.guard')],code:error.code};}};`,
    );
    const nextWorker = require.resolve('next/dist/lib/worker');
    const parent = join(dir, 'parent.cjs');
    writeFileSync(
      parent,
      `
      const {Worker}=require(${JSON.stringify(nextWorker)});
      (async()=>{
        const worker=new Worker(${JSON.stringify(worker)},{numWorkers:1,exposedMethods:['probe'],enableWorkerThreads:false});
        try{console.log(JSON.stringify(await worker.probe()));}finally{await worker.end();}
      })().catch(error=>{console.error(error.message);process.exitCode=1;});
    `,
    );
    const output = execFileSync(process.execPath, [parent], {
      env: createBuildEnv(process.env),
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.deepEqual(JSON.parse(output.trim()), {
      guard: true,
      code: 'LOBE_INTRANET_EGRESS_DENIED',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lobe build '));
  const code = (
    esm,
    step,
  ) => `${esm ? "import fs from 'node:fs'; import assert from 'node:assert/strict';" : "const fs=require('node:fs'),assert=require('node:assert/strict');"}
    assert(globalThis[Symbol.for('lobehub.intranet.guard')]);
    assert.equal(process.env.LOBE_INTRANET_ALLOWED_ENDPOINTS,'');
    const step=${JSON.stringify(step)}==='vite'?(process.env.MOBILE==='true'?'mobile':'desktop'):${JSON.stringify(step)};
    fs.appendFileSync(process.env.BUILD_EVENT_FILE,step+'\\n');
    if(step===process.env.BUILD_FAIL_STEP)process.exit(13);
  `;
  for (const [file, step] of [
    ['node_modules/vite/bin/vite.js', 'vite'],
    ['node_modules/next/dist/bin/next', 'next'],
    ['scripts/copySpaBuild.mts', 'copy-assets'],
    ['scripts/generateSpaTemplates.mts', 'generate-templates'],
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), code(file.endsWith('.mts'), step));
  }
  mkdirSync(join(root, 'public/_spa'), { recursive: true });
  writeFileSync(join(root, 'public/_spa/stale'), 'stale');
  return { root, env: { ...process.env, BUILD_EVENT_FILE: join(root, 'events') } };
}

test('all build stages execute sequentially with guard, including native .mts utilities', async () => {
  const setup = fixture();
  try {
    await runBuild('all', setup);
    assert.deepEqual(readFileSync(setup.env.BUILD_EVENT_FILE, 'utf8').trim().split('\n'), [
      'desktop',
      'mobile',
      'copy-assets',
      'generate-templates',
      'next',
    ]);
    assert(!existsSync(join(setup.root, 'public/_spa/stale')));
  } finally {
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('Next removes stale output before execution, preserves cache, and copy leaves output intact', async () => {
  const setup = fixture();
  const files = {
    '.next/server/app/api/dev/stale': 'old route',
    '.next/standalone/server.js': 'old standalone',
    '.next/BUILD_ID': 'old build',
    '.next/cache/webpack/retained': 'reusable cache',
  };
  try {
    for (const [file, contents] of Object.entries(files)) {
      const target = join(setup.root, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }

    await runBuild('copy', setup);
    for (const [file, contents] of Object.entries(files))
      assert.equal(readFileSync(join(setup.root, file), 'utf8'), contents);

    // These checks execute inside the spawned Next CLI, proving cleanup happens
    // before compilation and does not remove artifacts produced by that child.
    const nextCLI = join(setup.root, 'node_modules/next/dist/bin/next');
    writeFileSync(
      nextCLI,
      readFileSync(nextCLI, 'utf8') +
        `
      for(const file of ['.next/server','.next/standalone','.next/BUILD_ID'])
        assert.equal(fs.existsSync(file),false,file);
      assert.equal(fs.readFileSync('.next/cache/webpack/retained','utf8'),'reusable cache');
      fs.writeFileSync('.next/BUILD_ID','new build');
      `,
    );
    await runBuild('next', setup);
    assert.equal(readFileSync(join(setup.root, '.next/BUILD_ID'), 'utf8'), 'new build');
    assert.equal(
      readFileSync(join(setup.root, '.next/cache/webpack/retained'), 'utf8'),
      'reusable cache',
    );
    assert(!existsSync(join(setup.root, '.next/server')));
    assert(!existsSync(join(setup.root, '.next/standalone')));
  } finally {
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('failed stage stops the pipeline instead of producing a falsely successful image', async () => {
  const setup = fixture();
  try {
    setup.env.BUILD_FAIL_STEP = 'mobile';
    await assert.rejects(runBuild('all', setup), /mobile failed \(13\)/);
    assert.deepEqual(readFileSync(setup.env.BUILD_EVENT_FILE, 'utf8').trim().split('\n'), [
      'desktop',
      'mobile',
    ]);
  } finally {
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test('package build entry points and both Dockerfiles use the same guarded launcher', () => {
  const root = join(__dirname, '../..');
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const name of [
    'build:intranet',
    'build:next',
    'build:next:raw',
    'build:raw',
    'build:spa',
    'build:spa:raw',
    'build:spa:mobile',
    'build:spa:copy',
    'build:analyze',
  ])
    assert(manifest.scripts[name].startsWith('node ./scripts/intranet/build.cjs '), name);
  for (const file of ['Dockerfile', 'Dockerfile.intranet'])
    assert(
      readFileSync(join(root, file), 'utf8').includes(
        'RUN --network=none node scripts/intranet/build.cjs all',
      ),
    );
  assert(!readFileSync(join(root, 'next.config.ts'), 'utf8').includes('ignoreBuildErrors'));
  assert.match(
    readFileSync(join(root, 'next.config.ts'), 'utf8'),
    /webpackMemoryOptimizations:\s*true/,
  );
  assert(!existsSync(join(root, 'src/app/desktop')));
  assert(!existsSync(join(root, 'src/app/(backend)/trpc/desktop')));
});
