import { TRPCError } from '@trpc/server';

/** Local wire contracts only, so existing clients can decode old records without a SaaS SDK. */
interface KlavisTool {
  description?: string;
  inputSchema: { properties?: Record<string, unknown>; required?: string[]; type: string };
  name: string;
}
interface RemovedKlavisClient {
  mcpServer: {
    callTools(input: unknown): Promise<{
      error?: string;
      result?: { content?: unknown[]; isError?: boolean };
      success: boolean;
    }>;
    createServerInstance(
      input: unknown,
    ): Promise<{ instanceId: string; oauthUrl?: string; serverUrl: string }>;
    deleteServerInstance(id: string): Promise<void>;
    getServerInstance(id: string): Promise<{
      authNeeded?: boolean;
      externalUserId?: string;
      instanceId: string;
      isAuthenticated: boolean;
      oauthUrl?: string;
      platform?: string;
      serverName?: string;
    }>;
    getTools(name: string): Promise<{ tools: KlavisTool[] }>;
    listTools(input: unknown): Promise<{ tools: KlavisTool[] }>;
  };
  user: { getUserIntegrations(userId: string): Promise<{ integrations: unknown[] }> };
}

/** Always rejects, even if a legacy KLAVIS_API_KEY exists in the environment. */
export const getKlavisClient = (): RemovedKlavisClient => {
  throw new TRPCError({ code: 'FORBIDDEN', message: 'INTRANET_FEATURE_DISABLED: Klavis' });
};
export const isKlavisClientAvailable = (): boolean => false;
