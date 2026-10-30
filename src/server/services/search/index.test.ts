// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchService } from './index';

afterEach(() => vi.restoreAllMocks());

describe('Intranet search', () => {
  it('refuses all public search/crawl paths without invoking any provider fallback', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const service = new SearchService();
    await expect(service.query('private query')).rejects.toMatchObject({
      code: 'INTRANET_FEATURE_DISABLED',
    });
    await expect(service.webSearch({ query: 'private query' })).rejects.toMatchObject({
      code: 'INTRANET_FEATURE_DISABLED',
    });
    await expect(
      service.crawlPages({ urls: ['https://example.com'], impls: ['jina'] }),
    ).rejects.toMatchObject({ code: 'INTRANET_FEATURE_DISABLED' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
