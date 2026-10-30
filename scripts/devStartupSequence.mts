import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import net from 'node:net';

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

import { resolveCliNextPort, resolveLocalDevConfig } from './localDevConfig';

const configureDevEnvironment = () => {
  const env = process.env.NODE_ENV || 'development';
  const args = process.argv.slice(2);
  const shellEnv = Object.entries(process.env).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (typeof value === 'string') acc[key] = value;
      return acc;
    },
    {},
  );
  const dotenvEnv: Record<string, string> = {};
  const dotenvResult = dotenv.config({
    override: true,
    // Match Next's file precedence; explicit shell values still win below.
    path: ['.env', `.env.${env}`, '.env.local', `.env.${env}.local`],
    processEnv: dotenvEnv,
  });

  // Resolve CLI PORT first so references such as APP_URL=http://localhost:${PORT} agree.
  const cliPort = resolveCliNextPort(args);
  if (dotenvResult.parsed) {
    const expanded = dotenvExpand.expand({
      parsed: dotenvResult.parsed,
      processEnv: {
        ...dotenvEnv,
        ...shellEnv,
        ...(cliPort === undefined ? {} : { PORT: String(cliPort) }),
      },
    });
    Object.assign(process.env, expanded.parsed, shellEnv);
  }

  return resolveLocalDevConfig(args, process.env);
};

const NEXT_HOST = 'localhost';
const NEXT_READY_TIMEOUT_MS = 180_000;
const NEXT_READY_RETRY_MS = 400;

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let nextProcess: ChildProcess | undefined;
let viteProcess: ChildProcess | undefined;
let shuttingDown = false;
const startupAbort = new AbortController();

const runNpmScript = (scriptName: string) =>
  spawn(npmCommand, ['run', scriptName], {
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });

const isPortOpen = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const onDone = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once('connect', () => onDone(true));
    socket.once('error', () => onDone(false));
    socket.setTimeout(1_000, () => onDone(false));
  });

const waitForNextReady = async (port: number) => {
  const startedAt = Date.now();

  while (!shuttingDown && Date.now() - startedAt < NEXT_READY_TIMEOUT_MS) {
    if (await isPortOpen(NEXT_HOST, port)) return true;
    await wait(NEXT_READY_RETRY_MS);
  }

  if (shuttingDown) return false;

  throw new Error(
    `Next server was not ready within ${NEXT_READY_TIMEOUT_MS / 1000}s on ${NEXT_HOST}:${port}`,
  );
};

const prewarmNextRootCompile = async (rootUrl: string) => {
  const startedAt = Date.now();
  const response = await fetch(rootUrl, {
    signal: AbortSignal.any([startupAbort.signal, AbortSignal.timeout(120_000)]),
  });
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`✅ Next prewarm request finished (${response.status}) in ${elapsed}s ${rootUrl}`);
};

const runNextBackgroundTasks = (port: number, rootUrl: string) => {
  setTimeout(() => {
    if (!shuttingDown) console.log(`🔁 Next server URL: ${rootUrl}`);
  }, 2_000).unref();

  void (async () => {
    try {
      if (await waitForNextReady(port)) await prewarmNextRootCompile(rootUrl);
    } catch (error) {
      if (!shuttingDown) console.warn('⚠️ Next prewarm skipped:', error);
    }
  })();
};

const terminateChild = (child?: ChildProcess) => {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
};

const shutdownAll = (exitCode: number) => {
  if (shuttingDown) return;
  shuttingDown = true;
  startupAbort.abort();

  terminateChild(viteProcess);
  terminateChild(nextProcess);

  process.exitCode = exitCode;
};

const watchChildExit = (child: ChildProcess, name: 'next' | 'vite') =>
  new Promise<void>((resolve) => {
    child.once('error', (error) => {
      console.error(`❌ Failed to start ${name}:`, error.message);
      shutdownAll(1);
      resolve();
    });
    child.once('exit', (code, signal) => {
      if (!shuttingDown) {
        console.error(
          `❌ ${name} exited unexpectedly (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`,
        );
        shutdownAll(code && code > 0 ? code : 1);
      }
      resolve();
    });
  });

const main = async () => {
  const localConfig = configureDevEnvironment();
  Object.assign(process.env, localConfig.env);

  process.once('SIGINT', () => shutdownAll(130));
  process.once('SIGTERM', () => shutdownAll(143));

  nextProcess = spawn('npx', ['next', 'dev', '-p', String(localConfig.port)], {
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const nextExited = watchChildExit(nextProcess, 'next');

  viteProcess = runNpmScript('dev:spa');
  const viteExited = watchChildExit(viteProcess, 'vite');
  runNextBackgroundTasks(localConfig.port, `${localConfig.backendUrl}/`);

  await Promise.race([nextExited, viteExited]);
};

void main().catch((error) => {
  console.error('❌ dev startup sequence failed:', error);
  shutdownAll(1);
});
