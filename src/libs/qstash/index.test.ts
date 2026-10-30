// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { qstashClient, verifyQStashSignature, workflowClient } from './index';

describe('removed cloud queue interfaces', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('fails explicitly without network activity even with legacy credentials', async () => {
    vi.stubEnv('QSTASH_TOKEN', 'legacy-key');
    const network = vi.spyOn(globalThis, 'fetch');
    await expect(qstashClient.publishJSON({ url: 'https://example.com' })).rejects.toMatchObject({
      code: 'INTRANET_FEATURE_DISABLED',
    });
    await expect(workflowClient.trigger({ url: 'https://example.com' })).rejects.toMatchObject({
      code: 'INTRANET_FEATURE_DISABLED',
    });
    expect(network).not.toHaveBeenCalled();
  });

  it('never authenticates a retired cloud webhook', async () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'legacy-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'legacy-key');
    expect(
      await verifyQStashSignature(
        new Request('http://localhost', { headers: { 'Upstash-Signature': 'anything' } }),
        '{}',
      ),
    ).toBe(false);
  });
});
