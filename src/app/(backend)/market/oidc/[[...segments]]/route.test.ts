// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

describe('retired public Market OIDC proxy', () => {
  it.each([
    ['GET', GET],
    ['POST', POST],
  ] as const)(
    '%s rejects before parsing a request or reading identity',
    async (_method, handler) => {
      const network = vi.spyOn(globalThis, 'fetch');
      try {
        const response = handler();
        expect(response.status).toBe(410);
        expect(await response.json()).toMatchObject({ error: 'INTRANET_FEATURE_DISABLED' });
        expect(network).not.toHaveBeenCalled();
      } finally {
        network.mockRestore();
      }
    },
  );
});
