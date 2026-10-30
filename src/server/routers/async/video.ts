import { z } from 'zod';

import { asyncTrpc } from '@/libs/trpc/async/init';
import { unavailable } from '@/server/intranet/services';

const createVideoInputSchema = z.object({
  asyncTaskCreatedAt: z.date(),
  asyncTaskId: z.string(),
  generationBatchId: z.string(),
  generationId: z.string(),
  generationTopicId: z.string(),
  inferenceId: z.string(),
  model: z.string(),
  prechargeResult: z.unknown().optional(),
  provider: z.string(),
});

/** Old queue callbacks cannot initialize a provider or a video processing service. */
export const videoRouter = asyncTrpc.router({
  createVideo: asyncTrpc.procedure
    .input(createVideoInputSchema)
    .mutation(async (): Promise<{ message?: string; success: boolean }> =>
      unavailable('Video generation and polling'),
    ),
});
