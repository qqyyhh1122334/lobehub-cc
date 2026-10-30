import type { LineApiClient } from '@lobechat/chat-adapter-line';
import type { fetchQrCode, pollQrStatus } from '@lobechat/chat-adapter-wechat';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import type {
  AgentBotProviderModel,
  DecryptedBotProvider,
} from '@/database/models/agentBotProvider';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import type { SerializedPlatformDefinition } from '@/server/services/bot/platforms/types';
import type { BotRuntimeStatus, BotRuntimeStatusSnapshot } from '@/types/botRuntimeStatus';

// Retained wire schemas let existing clients report the removed feature explicitly.
const unavailable = <T>(): T => {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      'INTRANET_FEATURE_DISABLED: Cloud bot channels are unavailable in the intranet edition',
  });
};

type ProviderWithStatus = DecryptedBotProvider & { runtimeStatus: BotRuntimeStatus };
type LineBotInfo = Awaited<ReturnType<LineApiClient['getBotInfo']>>;
// Reject before input parsing, secret decryption, database reads, or API clients.
const agentBotProviderProcedure = authedProcedure.use(() => unavailable<never>());

export const agentBotProviderRouter = router({
  listPlatforms: authedProcedure.query((): SerializedPlatformDefinition[] => []),

  create: agentBotProviderProcedure
    .input(
      z.object({
        agentId: z.string(),
        applicationId: z.string(),
        credentials: z.record(z.string()),
        enabled: z.boolean().optional(),
        platform: z.string(),
        settings: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(() => unavailable<ReturnType<AgentBotProviderModel['create']>>()),

  delete: agentBotProviderProcedure
    .input(z.object({ id: z.string() }))
    .mutation(() => unavailable<ReturnType<AgentBotProviderModel['delete']>>()),

  getByAgentId: agentBotProviderProcedure
    .input(z.object({ agentId: z.string() }))
    .query(() => unavailable<ProviderWithStatus[]>()),

  getRuntimeStatus: agentBotProviderProcedure
    .input(z.object({ applicationId: z.string(), platform: z.string() }))
    .query(() => unavailable<BotRuntimeStatusSnapshot>()),

  refreshRuntimeStatus: agentBotProviderProcedure
    .input(z.object({ applicationId: z.string(), platform: z.string() }))
    .mutation(() => unavailable<BotRuntimeStatusSnapshot>()),

  refreshRuntimeStatusesByAgent: agentBotProviderProcedure
    .input(z.object({ agentId: z.string() }))
    .mutation(() => unavailable<{ ok: true }>()),

  list: agentBotProviderProcedure
    .input(
      z
        .object({
          agentId: z.string().optional(),
          platform: z.string().optional(),
        })
        .optional(),
    )
    .query(() => unavailable<ProviderWithStatus[]>()),

  connectBot: agentBotProviderProcedure
    .input(z.object({ applicationId: z.string(), platform: z.string() }))
    .mutation(() => unavailable<{ status: 'started' | 'queued' }>()),

  testConnection: agentBotProviderProcedure
    .input(z.object({ applicationId: z.string(), platform: z.string() }))
    .mutation(() => unavailable<{ valid: boolean }>()),

  // Legacy QR and identity endpoints retain response types but cannot contact providers.
  lineFetchBotInfo: agentBotProviderProcedure
    .input(z.object({ channelAccessToken: z.string().min(1) }))
    .mutation(() =>
      unavailable<{
        basicId: LineBotInfo['basicId'];
        displayName: LineBotInfo['displayName'];
        userId: string;
      }>(),
    ),

  wechatGetQrCode: agentBotProviderProcedure.mutation(() =>
    unavailable<ReturnType<typeof fetchQrCode>>(),
  ),

  wechatPollQrStatus: agentBotProviderProcedure
    .input(z.object({ qrcode: z.string() }))
    .query(() => unavailable<ReturnType<typeof pollQrStatus>>()),

  update: agentBotProviderProcedure
    .input(
      z.object({
        applicationId: z.string().optional(),
        credentials: z.record(z.string()).optional(),
        enabled: z.boolean().optional(),
        id: z.string(),
        platform: z.string().optional(),
        settings: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(() => unavailable<ReturnType<AgentBotProviderModel['update']>>()),
});
