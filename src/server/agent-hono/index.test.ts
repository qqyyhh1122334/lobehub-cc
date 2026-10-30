// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  exec: vi.fn((ctx: any) => ctx.json({ success: true })),
  finalize: vi.fn((ctx: any) => ctx.json({ success: true })),
  tool: vi.fn((ctx: any) => ctx.json({ success: true })),
}));
vi.mock('./handlers/execAgent', () => ({ execAgent: handlers.exec }));
vi.mock('./handlers/finalizeAbandoned', () => ({ finalizeAbandoned: handlers.finalize }));
vi.mock('./handlers/toolResult', () => ({ toolResult: handlers.tool }));

import app from './index';

describe('intranet agent HTTP surface', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each([
    '/run',
    '/gateway',
    '/gateway/start',
    '/gateway/callback',
    '/webhooks/bot-callback',
    '/webhooks/slack/app',
    '/messenger/slack/install',
    '/messenger/slack/oauth/callback',
    '/messenger/webhooks/slack',
  ])('retires cloud endpoint %s for both GET and POST', async (path) => {
    for (const method of ['GET', 'POST']) {
      const response = await app.request(`http://localhost/api/agent${path}`, { method });
      expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({ error: 'INTRANET_FEATURE_DISABLED' });
    }
    expect(handlers.exec).not.toHaveBeenCalled();
  });

  it('does not authenticate agent execution using a legacy cloud signature', async () => {
    vi.stubEnv('AGENT_EXEC_API_KEY', 'local-secret');
    const response = await app.request('http://localhost/api/agent', {
      method: 'POST',
      headers: { 'Upstash-Signature': 'old-token' },
    });
    expect(response.status).toBe(401);
    expect(handlers.exec).not.toHaveBeenCalled();
  });

  it('keeps operator-authenticated local execution available', async () => {
    vi.stubEnv('AGENT_EXEC_API_KEY', 'local-secret');
    const response = await app.request('http://localhost/api/agent', {
      method: 'POST',
      headers: { authorization: 'Bearer local-secret' },
    });
    expect(response.status).toBe(200);
    expect(handlers.exec).toHaveBeenCalledOnce();
  });
});
