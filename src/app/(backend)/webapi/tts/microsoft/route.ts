export const POST = async () =>
  Response.json(
    {
      error: {
        code: 'INTRANET_FEATURE_DISABLED',
        message: 'Microsoft cloud speech is unavailable in the intranet edition',
      },
    },
    { status: 410 },
  );
