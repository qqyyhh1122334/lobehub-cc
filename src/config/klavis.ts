/** Klavis requires its public SaaS control plane and is permanently disabled in this edition. */
export const getKlavisConfig = (): { KLAVIS_API_KEY: undefined } => ({ KLAVIS_API_KEY: undefined });
export const klavisEnv = getKlavisConfig();
export const getServerKlavisApiKey = (): undefined => undefined;
