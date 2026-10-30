import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { MessengerPlatform } from '@/config/messenger';
import type {
  AgentItem,
  MessengerAccountLinkItem,
  MessengerInstallationItem,
} from '@/database/schemas';
import { authedProcedure, publicProcedure, router } from '@/libs/trpc/lambda';
import type { LinkTokenPayload } from '@/server/services/messenger/linkTokenStore';
import type { SerializedMessengerPlatformDefinition } from '@/server/services/messenger/platforms/types';

const platformEnum = z.enum([
  'telegram',
  'slack',
  'discord',
]) satisfies z.ZodType<MessengerPlatform>;

// Keep the existing client contract while omitting every cloud SDK, credential
// lookup, token store and database middleware from this distribution's router.
type AvailablePlatform = SerializedMessengerPlatformDefinition & {
  appId: string | undefined;
  botUsername: string | undefined;
  enabled: boolean;
  platform: MessengerPlatform;
};
type LinkPreview =
  | { status: 'expired' }
  | { platform: MessengerPlatform; status: 'consumed'; tenantId: string | undefined }
  | {
      linkedToEmail: string | null;
      platform: LinkTokenPayload['platform'];
      platformUserId: string;
      platformUsername: string | undefined;
      status: 'active';
      tenantId: string | undefined;
      tenantName: string | undefined;
    };
type InstallationPreview = Pick<
  MessengerInstallationItem,
  'applicationId' | 'id' | 'platform' | 'tenantId'
> & {
  enterpriseId: NonNullable<unknown> | null;
  installedAt: Date;
  isEnterpriseInstall: boolean;
  scope: string;
  tenantName: string;
};
type LinkResult = { data: MessengerAccountLinkItem; success: boolean };

const unavailable = async <T>(): Promise<T> => {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Cloud messenger integrations are unavailable in the intranet edition',
  });
};

export const messengerRouter = router({
  availablePlatforms: publicProcedure.query(async (): Promise<AvailablePlatform[]> => []),
  confirmLink: authedProcedure
    .input(
      z.object({
        initialAgentId: z.string().min(1, 'messenger.error.pickDefaultAgent'),
        randomId: z.string().min(8),
      }),
    )
    .mutation(unavailable<LinkResult>),
  getMyLink: authedProcedure
    .input(z.object({ platform: platformEnum, tenantId: z.string().optional() }))
    .query(async (): Promise<MessengerAccountLinkItem | null> => null),
  listAgentsForBinding: authedProcedure.query(
    async (): Promise<Pick<AgentItem, 'avatar' | 'backgroundColor' | 'id' | 'title'>[]> => [],
  ),
  listMyInstallations: authedProcedure.query(async (): Promise<InstallationPreview[]> => []),
  listMyLinks: authedProcedure.query(async (): Promise<MessengerAccountLinkItem[]> => []),
  peekLinkToken: publicProcedure
    .input(z.object({ randomId: z.string().min(8) }))
    .query(unavailable<LinkPreview>),
  setActiveAgent: authedProcedure
    .input(
      z.object({
        agentId: z.string().nullable(),
        platform: platformEnum,
        tenantId: z.string().optional(),
      }),
    )
    .mutation(unavailable<LinkResult>),
  uninstallInstallation: authedProcedure
    .input(z.object({ installationId: z.string().min(1) }))
    .mutation(unavailable<{ success: boolean }>),
  unlink: authedProcedure
    .input(z.object({ platform: platformEnum, tenantId: z.string().optional() }))
    .mutation(unavailable<{ success: boolean }>),
});
