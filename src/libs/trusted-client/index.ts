export interface TrustedClientUserInfo {
  email?: string;
  name?: string;
  userId: string;
}

export { getSessionUser } from './getSessionUser';

/** The public Market identity bridge is permanently disabled in this edition. */
export const isTrustedClientEnabled = (): boolean => false;

/** Never serialize or encrypt user identity for a removed public service. */
export const generateTrustedClientToken = (_userInfo: TrustedClientUserInfo): string | undefined =>
  undefined;

/** Do not read session headers, authentication state, or database user information. */
export const getTrustedClientTokenForSession = async (): Promise<string | undefined> => undefined;
