// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { messengerRouter } from '../messenger';

const database = vi.hoisted(() => vi.fn());
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: database }));

const caller = messengerRouter.createCaller({ userId: 'local-user' });

describe('intranet messenger router', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns no cloud platforms, links, installations or binding agents without database/network access', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(await caller.availablePlatforms()).toEqual([]);
    expect(await caller.listMyLinks()).toEqual([]);
    expect(await caller.listMyInstallations()).toEqual([]);
    expect(await caller.listAgentsForBinding()).toEqual([]);
    expect(await caller.getMyLink({ platform: 'slack', tenantId: 'workspace' })).toBeNull();
    expect(database).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['peek', () => caller.peekLinkToken({ randomId: 'token-1234' })],
    ['confirm', () => caller.confirmLink({ initialAgentId: 'agent-1', randomId: 'token-1234' })],
    ['set agent', () => caller.setActiveAgent({ agentId: 'agent-1', platform: 'telegram' })],
    ['unlink', () => caller.unlink({ platform: 'discord' })],
    ['uninstall', () => caller.uninstallInstallation({ installationId: 'installation-1' })],
  ] as const)('rejects %s before database or network activity', async (_, operation) => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(operation()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Cloud messenger integrations are unavailable in the intranet edition',
    });
    expect(database).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps account-scoped reads authenticated', async () => {
    const anonymous = messengerRouter.createCaller({});
    await expect(anonymous.listMyLinks()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(database).not.toHaveBeenCalled();
  });
});
