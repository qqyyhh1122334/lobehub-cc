// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  generateTrustedClientToken,
  getSessionUser,
  getTrustedClientTokenForSession,
  isTrustedClientEnabled,
} from './index';
import * as session from './getSessionUser';

describe('disabled public Market identity bridge', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('cannot be enabled by legacy trusted-client secrets', async () => {
    vi.stubEnv('MARKET_TRUSTED_CLIENT_SECRET', 'legacy-secret');
    vi.stubEnv('MARKET_TRUSTED_CLIENT_ID', 'legacy-client');
    expect(isTrustedClientEnabled()).toBe(false);
    expect(
      generateTrustedClientToken({ userId: 'private-user', email: 'private@example.invalid' }),
    ).toBeUndefined();
    expect(await getSessionUser()).toBeUndefined();
  });

  it('does not inspect the user payload, read a session, or issue network requests', async () => {
    const sessionSpy = vi.spyOn(session, 'getSessionUser');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const userInfo = new Proxy(
      { userId: 'private-user' },
      {
        get() {
          throw new Error('Identity must not be read');
        },
      },
    );
    expect(generateTrustedClientToken(userInfo)).toBeUndefined();
    expect(await getTrustedClientTokenForSession()).toBeUndefined();
    expect(sessionSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
