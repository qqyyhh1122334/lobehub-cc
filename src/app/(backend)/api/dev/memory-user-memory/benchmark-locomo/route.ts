import { NextResponse } from 'next/server';

export const POST = async () =>
  NextResponse.json(
    {
      error: {
        code: 'INTRANET_FEATURE_DISABLED',
        message: 'Cloud memory benchmark are unavailable in the intranet edition',
      },
    },
    { status: 410 },
  );
