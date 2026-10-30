'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const removed = new Set([
  'klavis',
  '@upstash/qstash',
  '@upstash/workflow',
  '@vercel/analytics',
  '@vercel/speed-insights',
  '@vercel/functions',
  '@vercel/edge-config',
  '@vercel/otel',
  '@lobehub/analytics',
  'posthog-js',
  '@next/third-parties',
  '@neondatabase/serverless',
  'resend',
  'stripe',
  'svix',
  '@codesandbox/sandpack-react',
  'ffmpeg-static',
]);

function* files(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.next'].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(filename);
    else if (entry.isFile()) yield filename;
  }
}

test('removed SaaS SDKs cannot reappear in workspace manifests or source imports', () => {
  const failures = [];
  for (const filename of [
    path.join(root, 'package.json'),
    ...files(path.join(root, 'packages')),
    ...files(path.join(root, 'src')),
  ]) {
    const relative = path.relative(root, filename);
    if (path.basename(filename) === 'package.json') {
      const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
      for (const section of [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
      ]) {
        for (const name of Object.keys(manifest[section] || {})) {
          if (removed.has(name)) failures.push(`${relative}: ${section}.${name}`);
        }
      }
    } else if (/\.[cm]?[jt]sx?$/.test(filename)) {
      const source = fs.readFileSync(filename, 'utf8');
      for (const match of source.matchAll(
        /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g,
      )) {
        if ([...removed].some((name) => match[1] === name || match[1].startsWith(name + '/'))) {
          failures.push(`${relative}: ${match[1]}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('the normal production start command preloads the network guard', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(manifest.scripts.start, /--require \.\/scripts\/intranet\/network-guard\.cjs/);
  assert.equal(manifest.scripts['build:vercel'], undefined);
  assert.equal(manifest.scripts.qstash, undefined);
  assert.equal(fs.existsSync(path.join(root, 'vercel.json')), false);
});

test('disabled video entry points cannot import providers, file downloaders or native executors', () => {
  for (const filename of [
    'src/server/routers/lambda/video/index.ts',
    'src/server/routers/async/video.ts',
    'src/server/services/generation/video.ts',
    'src/server/services/generation/videoBackgroundPolling.ts',
  ]) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    assert.doesNotMatch(
      source,
      /(?:ModelRuntime|ffmpeg-static|node:child_process|services\/file|services\/generation\/video)/,
      filename,
    );
    assert.match(source, /unavailable\('Video generation/, filename);
  }
});

test('dependency lockfile generation is enabled for reproducible releases', () => {
  assert.match(fs.readFileSync(path.join(root, '.npmrc'), 'utf8'), /^lockfile=true$/m);
});

test('cloud adapter SDKs and market SDK are not production dependencies', () => {
  const cloudPackages = [
    '@chat-adapter/discord',
    '@chat-adapter/slack',
    '@chat-adapter/state-ioredis',
    '@chat-adapter/telegram',
    '@lobechat/chat-adapter-feishu',
    '@lobechat/chat-adapter-imessage',
    '@lobechat/chat-adapter-line',
    '@lobechat/chat-adapter-qq',
    '@lobechat/chat-adapter-wechat',
    'chat',
    '@anthropic-ai/sdk',
    '@aws-sdk/client-bedrock-runtime',
    '@azure-rest/ai-inference',
    '@azure/core-auth',
    '@fal-ai/client',
    '@google/genai',
    '@huggingface/inference',
    '@lobehub/market-sdk',
    'replicate',
  ];
  for (const file of [
    'package.json',
    'packages/model-runtime/package.json',
    'packages/types/package.json',
  ]) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    for (const name of cloudPackages)
      assert.equal(manifest.dependencies?.[name], undefined, `${file}: ${name}`);
  }
  const runtime = JSON.parse(
    fs.readFileSync(path.join(root, 'packages/model-runtime/package.json'), 'utf8'),
  );
  assert.equal(runtime.exports['./vertexai'], undefined);
});

test('direct framework startup cannot bypass the guard with a build-phase environment flag', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    process.env.NEXT_RUNTIME = 'nodejs';
    process.env.NEXT_PHASE = 'phase-production-build';
    const { register } = await import('./src/instrumentation.ts');
    try { await register(); process.exit(2); }
    catch (error) { if (!error.message.includes('network guard is missing')) throw error; }
  `,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
});
