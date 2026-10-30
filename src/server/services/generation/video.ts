import type { LobeChatDatabase } from '@lobechat/database';

import { unavailable } from '@/server/intranet/services';

export interface VideoProcessResult {
  coverKey: string;
  duration: number;
  fileHash: string;
  fileSize: number;
  height: number;
  mimeType: string;
  thumbnailKey: string;
  videoKey: string;
  width: number;
}

/** Native video processing is not included in the intranet web distribution. */
export class VideoGenerationService {
  constructor(_db: LobeChatDatabase, _userId: string) {
    unavailable('Video generation and processing');
  }

  async processVideoForGeneration(
    _videoUrl: string,
    _options?: { headers?: Record<string, string> },
  ): Promise<VideoProcessResult> {
    return unavailable('Video generation and processing');
  }
}
