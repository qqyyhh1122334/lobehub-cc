// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getKlavisConfig } from '@/config/klavis';
import { getKlavisClient, isKlavisClientAvailable } from './index';

describe('removed Klavis client', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('cannot be re-enabled by an old API key', () => {
    vi.stubEnv('KLAVIS_API_KEY', 'legacy-key');
    expect(getKlavisConfig().KLAVIS_API_KEY).toBeUndefined();
    expect(isKlavisClientAvailable()).toBe(false);
    expect(getKlavisClient).toThrow('INTRANET_FEATURE_DISABLED: Klavis');
  });
});
