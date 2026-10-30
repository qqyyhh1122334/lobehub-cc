import type { LobeChatDatabase } from '@/database/type';
import { unavailable } from '@/server/intranet/services';

interface BackgroundPollingParams {
  asyncTaskCreatedAt: Date;
  asyncTaskId: string;
  generationBatchId: string;
  generationId: string;
  generationTopicId: string;
  inferenceId: string;
  model: string;
  prechargeResult?: unknown;
  provider: string;
  userId: string;
}

/** Retired background jobs must fail before fetching or writing any data. */
export async function processBackgroundVideoPolling(
  _db: LobeChatDatabase,
  _params: BackgroundPollingParams,
): Promise<void> {
  return unavailable('Video generation and polling');
}
