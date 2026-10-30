import type { SearchParams, SearchQuery, UniformSearchResponse } from '@lobechat/types';
import type { CrawlImplType, CrawlUniformResult } from '@lobechat/web-crawler';

import { unavailable } from '@/server/intranet/services';

/** Internet search and crawlers are intentionally absent, including provider fallbacks. */
export class SearchService {
  async crawlPages(_input: {
    impls?: CrawlImplType[];
    urls: string[];
  }): Promise<{ results: CrawlUniformResult[] }> {
    return unavailable('Internet web crawling');
  }

  async query(_query: string, _params?: SearchParams): Promise<UniformSearchResponse> {
    return unavailable('Internet web search');
  }

  async webSearch(_input: SearchQuery): Promise<UniformSearchResponse> {
    return unavailable('Internet web search');
  }
}

export const searchService = new SearchService();
