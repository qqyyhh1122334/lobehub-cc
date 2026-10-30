// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getDatabase = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('Disabled cloud bots must not open the database');
  }),
);
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: getDatabase }));

import { agentBotProviderRouter } from '../agentBotProvider';
import { botMessageRouter } from '../botMessage';
import { platformRegistry } from '@/server/services/bot/platforms';

const context = { userId: 'legacy-cloud-bot-owner' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('Cloud APIs must not be contacted');
  });
});
afterEach(() => {
  expect(getDatabase).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('retired bot channels', () => {
  it('publishes an empty platform catalog and does not register SDK clients', async () => {
    expect(await agentBotProviderRouter.createCaller(context).listPlatforms()).toEqual([]);
    expect(platformRegistry.listPlatforms()).toEqual([]);
    expect(() => platformRegistry.createClient('discord', {} as never)).toThrow('not registered');
  });

  it.each(
    Object.keys(agentBotProviderRouter._def.procedures).filter((key) => key !== 'listPlatforms'),
  )(
    'rejects agentBotProvider.%s before parsing legacy credentials or reading the database',
    async (name) => {
      const caller = agentBotProviderRouter.createCaller(context);
      // Missing input proves the rejecting middleware runs before schema parsing.
      const invoke = caller[name as keyof typeof caller] as () => Promise<unknown>;
      await expect(invoke()).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('INTRANET_FEATURE_DISABLED'),
      });
    },
  );

  it.each(Object.keys(botMessageRouter._def.procedures))(
    'rejects botMessage.%s before resolving a send target',
    async (name) => {
      const caller = botMessageRouter.createCaller(context);
      const invoke = caller[name as keyof typeof caller] as () => Promise<unknown>;
      await expect(invoke()).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('INTRANET_FEATURE_DISABLED'),
      });
    },
  );
});
