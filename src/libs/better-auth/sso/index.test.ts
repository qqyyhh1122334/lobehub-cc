// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authEnv } from '@/envs/auth';

import { initBetterAuthSSOProviders } from './index';

vi.mock('@/envs/auth', () => ({ authEnv: { AUTH_SSO_PROVIDERS: '' } }));

afterEach(() => {
  vi.restoreAllMocks();
  (authEnv as { AUTH_SSO_PROVIDERS: string }).AUTH_SSO_PROVIDERS = '';
});

describe('intranet authentication', () => {
  it('offers no external SSO provider or metadata discovery by default', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(initBetterAuthSSOProviders()).toEqual({
      genericOAuthProviders: [],
      socialProviders: {},
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['google', 'github', 'generic-oidc', 'apple', 'keycloak'])(
    'rejects %s SSO configuration before requests',
    (provider) => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      (authEnv as { AUTH_SSO_PROVIDERS: string }).AUTH_SSO_PROVIDERS = provider;
      expect(() => initBetterAuthSSOProviders()).toThrow(/Outbound SSO clients/);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
