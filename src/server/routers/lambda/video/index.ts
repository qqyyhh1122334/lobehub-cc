import type { GenerationBatchItem, GenerationItem } from '@lobechat/database/schemas';
import { z } from 'zod';

import { publicProcedure, router } from '@/libs/trpc/lambda';
import { unavailable } from '@/server/intranet/services';

const createVideoInputSchema = z.object({
  generationTopicId: z.string(),
  model: z.string(),
  params: z
    .object({
      aspectRatio: z.string().optional(),
      cameraFixed: z.boolean().optional(),
      duration: z.number().optional(),
      endImageUrl: z.string().nullable().optional(),
      generateAudio: z.boolean().optional(),
      imageUrl: z.string().nullable().optional(),
      prompt: z.string(),
      resolution: z.string().optional(),
      seed: z.number().nullable().optional(),
    })
    .passthrough(),
  provider: z.string(),
});
export type CreateVideoServicePayload = z.infer<typeof createVideoInputSchema>;

// Preserve the shared client's wire types, while refusing legacy requests before
// database writes, provider initialization, polling or native video processing.
interface CreateVideoResult {
  data: {
    batch: GenerationBatchItem;
    generations: Array<GenerationItem & { asyncTaskId: string }>;
  };
  success: boolean;
}

export const videoRouter = router({
  createVideo: publicProcedure
    .input(createVideoInputSchema)
    .mutation(async (): Promise<CreateVideoResult> => unavailable('Video generation')),
  getVideoFreeQuota: publicProcedure
    .input(z.object({ model: z.string() }))
    .query(async (): Promise<{ limit: number; used: number } | null> =>
      unavailable('Video generation'),
    ),
});

export type VideoRouter = typeof videoRouter;
