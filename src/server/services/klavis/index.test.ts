// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KlavisService } from './index';

describe('Klavis is unavailable in the intranet edition', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('never advertises legacy cloud manifests even with an API key', async () => {
    vi.stubEnv('KLAVIS_API_KEY', 'legacy-key');
    const service = new KlavisService({ db: {} as never, userId: 'user-1' });
    expect(await service.getKlavisManifests()).toEqual([]);
  });

  it('returns a clear failure without creating a client or contacting the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await new KlavisService().executeKlavisTool({
      args: {},
      identifier: 'gmail',
      toolName: 'sendEmail',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTRANET_FEATURE_DISABLED');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
