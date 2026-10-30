// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { trpc } from '../init';
import { marketUserInfo } from './marketUserInfo';

const router = trpc.router({
  inspect: trpc.procedure.use(marketUserInfo).query(({ ctx }) => ({
    token: ctx.marketAccessToken,
    user: ctx.marketUserInfo,
  })),
});

describe('disabled Market identity middleware', () => {
  it('clears legacy token context without inspecting the database or contacting a service', async () => {
    const db = new Proxy(
      {},
      {
        get() {
          throw new Error('Database must not be inspected');
        },
      },
    );
    const network = vi.spyOn(globalThis, 'fetch');
    try {
      const caller = router.createCaller({
        marketAccessToken: 'old-token',
        serverDB: db,
        userId: 'private-user',
      } as never);
      expect(await caller.inspect()).toEqual({ token: undefined, user: undefined });
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
});
