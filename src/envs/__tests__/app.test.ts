// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const controlledKeys = [
  'APP_URL',
  'INTERNAL_APP_URL',
  'PORT',
  'AGENTS_INDEX_URL',
  'PLUGINS_INDEX_URL',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'AGENT_RUNTIME_MODE',
  'QSTASH_TOKEN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'TELEMETRY_DISABLED',
] as const;

beforeEach(() => {
  vi.resetModules();
  for (const key of controlledKeys) vi.stubEnv(key, undefined);
  vi.stubEnv('NODE_ENV', 'test');
});
afterEach(() => vi.unstubAllEnvs());

const readConfig = async () => (await import('../app')).getAppConfig();

describe('intranet application URLs', () => {
  it('uses local catalog URLs when no environment overrides are set', async () => {
    const config = await readConfig();
    expect(config.AGENTS_INDEX_URL).toBe('http://localhost:3210/intranet/catalog/agents');
    expect(config.PLUGINS_INDEX_URL).toBe('http://localhost:3210/intranet/catalog/plugins');
  });

  it('uses the explicit APP_URL as the local catalog origin', async () => {
    vi.stubEnv('APP_URL', 'https://chat.corp.internal');
    const config = await readConfig();
    expect(config.AGENTS_INDEX_URL).toBe('https://chat.corp.internal/intranet/catalog/agents');
    expect(config.PLUGINS_INDEX_URL).toBe('https://chat.corp.internal/intranet/catalog/plugins');
  });

  it('retains explicit private catalog overrides', async () => {
    vi.stubEnv('AGENTS_INDEX_URL', 'http://catalog.internal/agents');
    vi.stubEnv('PLUGINS_INDEX_URL', 'http://catalog.internal/plugins');
    const config = await readConfig();
    expect(config.AGENTS_INDEX_URL).toBe('http://catalog.internal/agents');
    expect(config.PLUGINS_INDEX_URL).toBe('http://catalog.internal/plugins');
  });

  it('uses local catalogs when overrides are empty strings', async () => {
    vi.stubEnv('AGENTS_INDEX_URL', '');
    vi.stubEnv('PLUGINS_INDEX_URL', '');
    const config = await readConfig();
    expect(config.AGENTS_INDEX_URL).toBe('http://localhost:3210/intranet/catalog/agents');
    expect(config.PLUGINS_INDEX_URL).toBe('http://localhost:3210/intranet/catalog/plugins');
  });

  it('defaults INTERNAL_APP_URL to the explicitly configured APP_URL', async () => {
    vi.stubEnv('APP_URL', 'https://chat.corp.internal');
    const config = await readConfig();
    expect(config.INTERNAL_APP_URL).toBe('https://chat.corp.internal');
  });

  it('uses the explicit internal service URL separately from the browser origin', async () => {
    vi.stubEnv('APP_URL', 'https://chat.corp.internal');
    vi.stubEnv('INTERNAL_APP_URL', 'http://lobehub:3210');
    const config = await readConfig();
    expect(config.APP_URL).toBe('https://chat.corp.internal');
    expect(config.INTERNAL_APP_URL).toBe('http://lobehub:3210');
  });

  it('retains the loopback default when old Vercel variables are set', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'old-project.vercel.app');
    vi.stubEnv('VERCEL_URL', 'old-deployment.vercel.app');
    vi.stubEnv('VERCEL_BRANCH_URL', 'old-branch.vercel.app');
    const config = await readConfig();
    expect(config.APP_URL).toBe('http://localhost:3210');
    expect(config.INTERNAL_APP_URL).toBe('http://localhost:3210');
    expect(config.AGENTS_INDEX_URL).not.toContain('vercel.app');
  });

  it('never substitutes Vercel preview URLs for the explicit intranet origin', async () => {
    vi.stubEnv('APP_URL', 'https://chat.corp.internal');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'old-preview.vercel.app');
    expect((await readConfig()).APP_URL).toBe('https://chat.corp.internal');
  });

  it('uses localhost:3010 for development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect((await readConfig()).APP_URL).toBe('http://localhost:3010');
  });

  it('honors an explicit local port', async () => {
    vi.stubEnv('PORT', '4000');
    expect((await readConfig()).APP_URL).toBe('http://localhost:4000');
  });
});

describe('intranet capabilities are not enabled by legacy credentials', () => {
  it('keeps local execution and telemetry suppression immutable', async () => {
    vi.stubEnv('AGENT_RUNTIME_MODE', 'queue');
    vi.stubEnv('QSTASH_TOKEN', 'old-token');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://old-telemetry.invalid');
    vi.stubEnv('TELEMETRY_DISABLED', '0');
    const config = await readConfig();
    expect(config.enableQueueAgentRuntime).toBe(false);
    expect(config.NEXT_PUBLIC_ENABLE_SENTRY).toBe(false);
    expect(config.TELEMETRY_DISABLED).toBe(true);
  });
});
