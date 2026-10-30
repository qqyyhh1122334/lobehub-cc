// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EdgeConfig } from './index';

describe('local configuration', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('does not activate from a legacy Vercel configuration URL', async () => {
    vi.stubEnv('VERCEL_EDGE_CONFIG', 'https://example.com/config');
    vi.stubEnv('INTRANET_EDGE_CONFIG_JSON', '');
    expect(EdgeConfig.isEnabled()).toBe(false);
    expect(await new EdgeConfig().getFeatureFlags()).toBeUndefined();
  });
  it('reads feature flags and restrictions solely from local JSON', async () => {
    vi.stubEnv(
      'INTRANET_EDGE_CONFIG_JSON',
      JSON.stringify({ feature_flags: { market: false }, assistant_whitelist: ['local'] }),
    );
    expect(await new EdgeConfig().getFeatureFlags()).toEqual({ market: false });
    expect(await new EdgeConfig().getAgentRestrictions()).toEqual({
      blacklist: undefined,
      whitelist: ['local'],
    });
  });
  it('rejects invalid local configuration rather than using a cloud fallback', async () => {
    vi.stubEnv('INTRANET_EDGE_CONFIG_JSON', '[]');
    await expect(new EdgeConfig().getFeatureFlags()).rejects.toThrow('JSON object');
  });
});
