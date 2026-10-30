/** Require the network policy before framework startup in this intranet distribution. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  if (!Reflect.get(globalThis, Symbol.for('lobehub.intranet.guard'))) {
    throw new Error(
      'Intranet network guard is missing. Start with pnpm start or the intranet container entrypoint.',
    );
  }

  // Public bot gateways and telemetry exporters are never started in this distribution.
}
