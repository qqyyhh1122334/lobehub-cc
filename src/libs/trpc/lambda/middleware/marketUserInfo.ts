import type { TrustedClientUserInfo } from '@/libs/trusted-client';

import { trpc } from '../init';

/** Retain the internal context contract without reading user identity or legacy Market tokens. */
export const marketUserInfo = trpc.middleware(async (opts) =>
  opts.next({
    ctx: {
      marketAccessToken: undefined as string | undefined,
      marketUserInfo: undefined as TrustedClientUserInfo | undefined,
    },
  }),
);
