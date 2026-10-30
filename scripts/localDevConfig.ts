const DEFAULT_NEXT_PORT = 3010;

function parsePort(value: string) {
  const rawPort = value.trim();
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The Next.js development port must be an integer between 1 and 65535');
  }
  return port;
}

/** Resolve this before dotenv expansion so CLI PORT also applies to variable references. */
export function resolveCliNextPort(args: readonly string[]) {
  let cliPort: string | undefined;
  const argumentsIterator = args[Symbol.iterator]();

  for (const argument of argumentsIterator) {
    if (argument === '-p' || argument === '--port') {
      const value = argumentsIterator.next();
      if (value.done) throw new Error(`${argument} requires a port between 1 and 65535`);
      cliPort = value.value;
    } else if (argument.startsWith('--port=') || argument.startsWith('-p=')) {
      cliPort = argument.slice(argument.indexOf('=') + 1);
    }
  }

  return cliPort === undefined ? undefined : parsePort(cliPort);
}

/** Keep both local dev processes on the same backend, regardless of standalone SPA settings. */
export function resolveLocalDevConfig(args: readonly string[], env: Record<string, string | undefined>) {
  const port = resolveCliNextPort(args) ?? parsePort(env.PORT || String(DEFAULT_NEXT_PORT));
  const backendUrl = `http://localhost:${port}`;
  return {
    backendUrl,
    env: {
      ...env,
      APP_URL: env.APP_URL || backendUrl,
      DEV_BACKEND_URL: backendUrl,
      INTERNAL_APP_URL: env.INTERNAL_APP_URL || backendUrl,
      PORT: String(port),
    },
    port,
  };
}
