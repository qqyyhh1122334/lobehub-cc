import type { LobeToolManifest } from '@lobechat/context-engine';
import type { LobeChatDatabase } from '@lobechat/database';

import type { ToolExecutionResult } from '@/server/services/toolExecution/types';

export interface KlavisToolExecuteParams {
  args: Record<string, unknown>;
  identifier: string;
  toolName: string;
}
export interface KlavisServiceOptions {
  db?: LobeChatDatabase;
  userId?: string;
}

/** Explicitly rejects legacy installed cloud connectors; never resolves their remote manifest. */
export class KlavisService {
  constructor(_options: KlavisServiceOptions = {}) {}

  async executeKlavisTool(_params: KlavisToolExecuteParams): Promise<ToolExecutionResult> {
    return {
      content: 'Klavis is unavailable in the intranet edition',
      error: {
        code: 'INTRANET_FEATURE_DISABLED',
        message: 'Klavis is unavailable in the intranet edition',
      },
      success: false,
    };
  }

  async getKlavisManifests(): Promise<LobeToolManifest[]> {
    return [];
  }
}
