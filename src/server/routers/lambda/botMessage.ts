import type { MessageRuntimeService } from '@lobechat/builtin-tool-message/executionRuntime';
import { MAX_BOT_HISTORY_LIMIT, MIN_BOT_HISTORY_LIMIT } from '@lobechat/const';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { authedProcedure, router } from '@/libs/trpc/lambda';

// Retained wire schemas let existing clients report the removed feature explicitly.
const unavailable = <T>(): T => {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      'INTRANET_FEATURE_DISABLED: Cloud bot channels are unavailable in the intranet edition',
  });
};

const botMessageProcedure = authedProcedure.use(() => unavailable<never>());
const attachmentsInputSchema = z.array(
  z.object({
    data: z.string().optional(),
    fetchUrl: z.string().url().optional(),
    mimeType: z.string().optional(),
    name: z.string().optional(),
    type: z.enum(['image', 'file', 'video', 'audio']),
  }),
);

export const botMessageRouter = router({
  // ==================== Direct Messaging ====================

  sendDirectMessage: botMessageProcedure
    .input(
      z
        .object({
          attachments: attachmentsInputSchema.optional(),
          botId: z.string().optional(),
          content: z.string(),
          messengerInstallationId: z.string().optional(),
          userId: z.string(),
        })
        .refine((v) => !!v.botId !== !!v.messengerInstallationId, {
          message: 'Provide exactly one of botId or messengerInstallationId',
        }),
    )
    .mutation(() =>
      unavailable<ReturnType<NonNullable<MessageRuntimeService['sendDirectMessage']>>>(),
    ),

  // ==================== Core Message Operations ====================

  sendMessage: botMessageProcedure
    .input(
      z
        .object({
          attachments: attachmentsInputSchema.optional(),
          botId: z.string().optional(),
          channelId: z.string(),
          content: z.string(),
          embeds: z.array(z.record(z.unknown())).optional(),
          messengerInstallationId: z.string().optional(),
          replyTo: z.string().optional(),
        })
        .refine((v) => !!v.botId !== !!v.messengerInstallationId, {
          message: 'Provide exactly one of botId or messengerInstallationId',
        }),
    )
    .mutation(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['sendMessage']>>>()),

  readMessages: botMessageProcedure
    .input(
      z.object({
        after: z
          .string()
          .optional()
          .transform((v) => v || undefined),
        before: z
          .string()
          .optional()
          .transform((v) => v || undefined),
        botId: z.string(),
        channelId: z.string(),
        cursor: z.string().optional(),
        endTime: z.string().optional(),
        limit: z.number().min(MIN_BOT_HISTORY_LIMIT).max(MAX_BOT_HISTORY_LIMIT).optional(),
        startTime: z.string().optional(),
      }),
    )
    .query(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['readMessages']>>>()),

  editMessage: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        channelId: z.string(),
        content: z.string(),
        messageId: z.string(),
      }),
    )
    .mutation(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['editMessage']>>>()),

  deleteMessage: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        channelId: z.string(),
        messageId: z.string(),
      }),
    )
    .mutation(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['deleteMessage']>>>()),

  searchMessages: botMessageProcedure
    .input(
      z.object({
        authorId: z.string().optional(),
        botId: z.string(),
        channelId: z.string(),
        limit: z.number().min(MIN_BOT_HISTORY_LIMIT).max(MAX_BOT_HISTORY_LIMIT).optional(),
        query: z.string(),
      }),
    )
    .query(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['searchMessages']>>>()),

  // ==================== Reactions ====================

  reactToMessage: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        channelId: z.string(),
        emoji: z.string(),
        messageId: z.string(),
      }),
    )
    .mutation(() =>
      unavailable<ReturnType<NonNullable<MessageRuntimeService['reactToMessage']>>>(),
    ),

  getReactions: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        channelId: z.string(),
        messageId: z.string(),
      }),
    )
    .query(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['getReactions']>>>()),

  // ==================== Pin Management ====================

  pinMessage: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        channelId: z.string(),
        messageId: z.string(),
      }),
    )
    .mutation(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['pinMessage']>>>()),

  unpinMessage: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        channelId: z.string(),
        messageId: z.string(),
      }),
    )
    .mutation(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['unpinMessage']>>>()),

  listPins: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        channelId: z.string(),
      }),
    )
    .query(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['listPins']>>>()),

  // ==================== Channel Management ====================

  getChannelInfo: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        channelId: z.string(),
      }),
    )
    .query(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['getChannelInfo']>>>()),

  listChannels: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        filter: z.string().optional(),
        serverId: z.string().optional(),
      }),
    )
    .query(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['listChannels']>>>()),

  // ==================== Member Information ====================

  getMemberInfo: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        memberId: z.string(),
        serverId: z.string().optional(),
      }),
    )
    .query(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['getMemberInfo']>>>()),

  // ==================== Thread Operations ====================

  createThread: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        channelId: z.string(),
        content: z.string().optional(),
        messageId: z.string().optional(),
        name: z.string(),
      }),
    )
    .mutation(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['createThread']>>>()),

  listThreads: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        channelId: z.string(),
      }),
    )
    .query(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['listThreads']>>>()),

  replyToThread: botMessageProcedure
    .input(
      z
        .object({
          attachments: attachmentsInputSchema.optional(),
          botId: z.string().optional(),
          content: z.string(),
          messengerInstallationId: z.string().optional(),
          threadId: z.string(),
        })
        .refine((v) => !!v.botId !== !!v.messengerInstallationId, {
          message: 'Provide exactly one of botId or messengerInstallationId',
        }),
    )
    .mutation(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['replyToThread']>>>()),

  // ==================== Polls ====================

  createPoll: botMessageProcedure
    .input(
      z.object({
        botId: z.string(),
        channelId: z.string(),
        duration: z.number().optional(),
        multipleAnswers: z.boolean().optional(),
        options: z.array(z.string()).min(2),
        question: z.string(),
      }),
    )
    .mutation(() => unavailable<ReturnType<NonNullable<MessageRuntimeService['createPoll']>>>()),
});
