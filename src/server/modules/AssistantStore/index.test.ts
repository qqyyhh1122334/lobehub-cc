// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { AssistantStore } from './index';

afterEach(() => vi.restoreAllMocks());

it('does not load external agent indexes, details, or fallback locales', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const store = new AssistantStore('https://external.example/catalog');
  await expect(store.getAgentIndex('en-US')).resolves.toEqual([]);
  await expect(store.getAgent('private-agent')).rejects.toMatchObject({
    code: 'INTRANET_FEATURE_DISABLED',
  });
  expect(() => store.getAgentUrl('agent')).toThrow(/unavailable/);
  expect(fetch).not.toHaveBeenCalled();
});
