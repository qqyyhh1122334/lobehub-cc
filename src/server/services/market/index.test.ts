// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractAccessToken, MarketService } from './index';

afterEach(() => vi.restoreAllMocks());

describe('Intranet MarketService', () => {
  it('does not transmit credentials or tools to a cloud marketplace', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const service = new MarketService({
      accessToken: 'private-token',
      userInfo: { userId: 'local-user' },
    });
    await expect(
      service.submitFeedback({ message: 'private-text', title: 'private' }),
    ).rejects.toMatchObject({ code: 'INTRANET_FEATURE_DISABLED' });
    await expect(
      service.uploadCredFile({ file: 'private', fileName: 'key', fileType: 'text/plain' }),
    ).rejects.toMatchObject({ code: 'INTRANET_FEATURE_DISABLED' });
    await expect(service.getUserInfoWithTrustedClient()).rejects.toMatchObject({
      code: 'INTRANET_FEATURE_DISABLED',
    });
    expect(() => service.getSDK().creds.list()).toThrow(/unavailable/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains local agent initialization without advertising unavailable cloud skills', async () => {
    const service = new MarketService();
    await expect(service.getLobehubSkillManifests()).resolves.toEqual([]);
    const result = await service.executeLobehubSkill({
      args: {},
      provider: 'github',
      toolName: 'read',
    });
    expect(result.success).toBe(false);
    expect(result.content).toMatch(/unavailable/);
  });

  it('preserves bearer extraction without contacting identity services', () => {
    const request = new Request('http://app.local', { headers: { authorization: 'Bearer token' } });
    expect(extractAccessToken(request as never)).toBe('token');
    expect(extractAccessToken(new Request('http://app.local') as never)).toBeUndefined();
  });
});
