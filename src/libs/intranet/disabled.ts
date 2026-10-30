/** SaaS-only capabilities are deliberately absent in this intranet distribution. */
export class IntranetFeatureUnavailableError extends Error {
  readonly code = 'INTRANET_FEATURE_DISABLED';
  constructor(feature: string) {
    super(`${feature} is unavailable in the intranet edition`);
    this.name = 'IntranetFeatureUnavailableError';
  }
}

export const disabledCloudRoute = () =>
  Response.json(
    {
      error: 'INTRANET_FEATURE_DISABLED',
      message: 'Cloud workflows are unavailable in the intranet edition',
    },
    { status: 410 },
  );
