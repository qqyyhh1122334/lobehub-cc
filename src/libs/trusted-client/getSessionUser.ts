import type { TrustedClientUserInfo } from './index';

/** Retained compatibility export; the disabled Market bridge never reads a user session. */
export const getSessionUser = async (): Promise<TrustedClientUserInfo | undefined> => undefined;
