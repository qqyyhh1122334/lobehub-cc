'use strict';

const { spawn } = require('node:child_process');
const { existsSync, readdirSync, rmSync } = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../..');
const guard = path.join(__dirname, 'network-guard.cjs');
const modes = new Set(['all', 'desktop', 'mobile', 'copy', 'next', 'analyze']);

function createBuildEnv(input = process.env, extra = {}) {
  const value = input.LOBE_BUILD_HEAP_MB || '4400';
  if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 8192)
    throw new Error('LOBE_BUILD_HEAP_MB must be an integer from 1024 through 8192');
  return {
    ...input,
    ...extra,
    // All Node build workers inherit the policy, including Next instrumentation.
    // No application runtime endpoint or user NODE_OPTIONS override is accepted.
    NODE_OPTIONS: `--max-old-space-size=${value} --require=${JSON.stringify(guard)}`,
    LOBE_INTRANET_ALLOWED_ENDPOINTS: '',
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    DOCKER: 'true',
    MOBILE: extra.MOBILE || 'false',
    RAYON_NUM_THREADS: '2',
    UV_THREADPOOL_SIZE: '2',
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    ALL_PROXY: '',
    http_proxy: '',
    https_proxy: '',
    all_proxy: '',
    NO_PROXY: '*',
    no_proxy: '*',
  };
}

function createBuildPlan(mode, root = repositoryRoot, nextArgs = []) {
  if (!modes.has(mode)) throw new Error(`Unknown build mode: ${mode}`);
  if (nextArgs.some((arg) => !['--webpack', '--debug'].includes(arg)))
    throw new Error('Only --webpack and --debug are supported as extra Next build arguments');
  if (nextArgs.length && !['all', 'next'].includes(mode))
    throw new Error('Extra Next arguments require all or next mode');
  const desktop = {
    name: 'desktop',
    args: [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'],
    env: {},
  };
  const mobile = {
    name: 'mobile',
    args: [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'],
    env: { MOBILE: 'true' },
  };
  // These scripts use only Node APIs. Node 24 strips their .mts type syntax;
  // avoiding the tsx CLI also avoids its unnecessary Unix IPC socket server.
  const copy = [
    { name: 'copy-assets', args: [path.join(root, 'scripts/copySpaBuild.mts')], env: {} },
    {
      name: 'generate-templates',
      args: [path.join(root, 'scripts/generateSpaTemplates.mts')],
      env: {},
    },
  ];
  const next = {
    name: 'next',
    args: [
      path.join(root, 'node_modules/next/dist/bin/next'),
      'build',
      '--webpack',
      ...nextArgs.filter((arg) => arg !== '--webpack'),
    ],
    env: {},
  };
  const plan = {
    all: [desktop, mobile, ...copy, next],
    desktop: [desktop],
    mobile: [mobile],
    copy,
    next: [next],
    analyze: [
      {
        name: 'analyze',
        args: [path.join(root, 'node_modules/next/dist/bin/next'), 'experimental-analyze'],
        env: {},
      },
    ],
  }[mode];
  return plan;
}

async function runBuild(
  mode = 'all',
  { root = repositoryRoot, env = process.env, nextArgs = [] } = {},
) {
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('The intranet build requires Node.js 24 or newer');
  const plan = createBuildPlan(mode, root, nextArgs);
  createBuildEnv(env); // Validate before deleting previous generated artifacts.
  for (const step of plan) {
    if (!existsSync(step.args[0]))
      throw new Error(
        `Missing build prerequisite: ${step.args[0]}. Install the locked dependencies during preparation.`,
      );
  }
  if (['all', 'desktop'].includes(mode))
    rmSync(path.join(root, 'public/_spa'), { recursive: true, force: true });
  let child;
  const onInterrupt = () => child?.kill('SIGINT');
  const onTerminate = () => child?.kill('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  try {
    for (const step of plan) {
      if (step.name === 'next') {
        const output = path.join(root, '.next');
        if (existsSync(output)) {
          // Remove stale generated output with retries before Next's parallel
          // cleanup. Retain its cache so repeated offline builds can reuse it.
          for (const entry of readdirSync(output)) {
            if (entry === 'cache') continue;
            rmSync(path.join(output, entry), {
              recursive: true,
              force: true,
              maxRetries: 10,
              retryDelay: 200,
            });
          }
        }
      }
      console.log(
        `[intranet-build] ${step.name}; network endpoints: none; heap: ${env.LOBE_BUILD_HEAP_MB || '4400'} MiB`,
      );
      await new Promise((resolve, reject) => {
        child = spawn(process.execPath, step.args, {
          cwd: root,
          env: createBuildEnv(env, step.env),
          stdio: 'inherit',
        });
        child.once('error', reject);
        child.once('exit', (code, signal) =>
          code === 0 ? resolve() : reject(new Error(`${step.name} failed (${signal || code})`)),
        );
      });
    }
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
  }
}

module.exports = { createBuildEnv, createBuildPlan, runBuild };
if (require.main === module) {
  runBuild(process.argv[2] || 'all', { nextArgs: process.argv.slice(3) }).catch((error) => {
    console.error(`[intranet-build] ${error.message}`);
    process.exitCode = 1;
  });
}
