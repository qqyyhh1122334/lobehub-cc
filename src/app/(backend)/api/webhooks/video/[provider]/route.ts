import { NextResponse } from 'next/server';

export const POST = async () =>
  NextResponse.json(
    {
      error: {
        code: 'INTRANET_FEATURE_DISABLED',
        message: 'Cloud video webhooks are unavailable in the intranet edition',
      },
    },
    { status: 410 },
  );
