/** Model weights are prepared and approved outside the isolated runtime. */
export const POST = () =>
  Response.json(
    {
      error: 'INTRANET_FEATURE_DISABLED',
      message:
        'Runtime model downloads are disabled. Ask the administrator to import an approved model.',
    },
    { status: 410 },
  );
