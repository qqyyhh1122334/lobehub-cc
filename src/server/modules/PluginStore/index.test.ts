// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { PluginStore } from './index';

afterEach(() => vi.restoreAllMocks());

it('does not load external plugin catalog or CDN fallbacks', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const store = new PluginStore('https://external.example/catalog');
  await expect(store.getPluginList('en-US')).resolves.toEqual([]);
  expect(() => store.getPluginIndexUrl('en-US')).toThrow(/unavailable/);
  expect(fetch).not.toHaveBeenCalled();
});
