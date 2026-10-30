import { type GenericOAuthConfig } from 'better-auth/plugins';
import { type SocialProviders } from 'better-auth/social-providers';

import { authEnv } from '@/envs/auth';
import { unavailable } from '@/server/intranet/services';

/** Email/password and local passkeys do not require an external identity provider. */
export const initBetterAuthSSOProviders = () => {
  if (authEnv.AUTH_SSO_PROVIDERS.trim()) unavailable('Outbound SSO clients');
  return {
    genericOAuthProviders: [] as GenericOAuthConfig[],
    socialProviders: {} as SocialProviders,
  };
};
