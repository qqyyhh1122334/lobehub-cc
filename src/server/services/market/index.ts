import { type LobeToolManifest } from '@lobechat/context-engine';
import { type MarketSDK } from '@lobehub/market-sdk';
import debug from 'debug';
import { type NextRequest } from 'next/server';

import { type TrustedClientUserInfo } from '@/libs/trusted-client';
import { createUnavailableClient, unavailable } from '@/server/intranet/services';

const log = debug('lobe-server:market-service');

// ============================== Helper Functions ==============================

/**
 * Extract access token from Authorization header
 */
export function extractAccessToken(req: NextRequest): string | undefined {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return undefined;
}

export interface LobehubSkillExecuteParams {
  args: Record<string, any>;
  context?: {
    topicId?: string;
  };
  provider: string;
  toolName: string;
}

export interface LobehubSkillExecuteResult {
  content: string;
  error?: { code: string; message?: string };
  success: boolean;
}

export interface MarketServiceOptions {
  /** Access token from OIDC flow (user token) */
  accessToken?: string;
  /** Client credentials for M2M authentication */
  clientCredentials?: {
    clientId: string;
    clientSecret: string;
  };
  /** Pre-generated trusted client token (alternative to userInfo) */
  trustedClientToken?: string;
  /** User info for generating trusted client token */
  userInfo?: TrustedClientUserInfo;
}

/**
 * Market Service
 *
 * Provides a unified interface to MarketSDK with business logic encapsulation.
 * This service wraps MarketSDK methods to avoid repetition across the codebase.
 *
 * Usage:
 * ```typescript
 * // From Next.js request (API Routes) - recommended
 * const marketService = await MarketService.createFromRequest(req);
 * await marketService.submitFeedback({ ... });
 *
 * // With user authentication
 * const service = new MarketService({ accessToken, userInfo });
 *
 * // With trusted client only
 * const service = new MarketService({ userInfo });
 *
 * // M2M authentication
 * const service = new MarketService({ clientCredentials: { clientId, clientSecret } });
 *
 * // Public endpoints (no auth)
 * const service = new MarketService();
 * ```
 */
export class MarketService {
  market: MarketSDK;

  constructor(_options: MarketServiceOptions = {}) {
    this.market = createUnavailableClient<MarketSDK>('Cloud marketplace');
  }

  // ============================== Factory Methods ==============================

  /**
   * Create MarketService from Next.js request (server-side only)
   * Extracts accessToken from Authorization header and trustedClientToken from session
   */
  static async createFromRequest(_req: NextRequest): Promise<MarketService> {
    return new MarketService();
  }

  // ============================== Feedback Methods ==============================

  /**
   * Submit feedback to LobeHub
   */
  async submitFeedback(params: {
    clientInfo?: {
      language?: string;
      timezone?: string;
      url?: string;
      userAgent?: string;
    };
    email?: string;
    message: string;
    screenshotUrl?: string;
    title: string;
  }) {
    const { title, message, email, screenshotUrl, clientInfo } = params;

    // Build message with screenshot if available
    let feedbackMessage = message;
    if (screenshotUrl) {
      feedbackMessage += `\n\n**Screenshot**: ${screenshotUrl}`;
    }

    return this.market.feedback.submitFeedback({
      clientInfo,
      email: email || '',
      message: feedbackMessage,
      title,
    });
  }

  // ============================== Auth Methods ==============================

  /**
   * Exchange OAuth authorization code for tokens
   */
  async exchangeAuthorizationCode(params: {
    clientId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }) {
    return this.market.auth.exchangeOAuthToken({
      clientId: params.clientId,
      code: params.code,
      codeVerifier: params.codeVerifier,
      grantType: 'authorization_code',
      redirectUri: params.redirectUri,
    });
  }

  /**
   * Get OAuth handoff information
   */
  async getOAuthHandoff(id: string) {
    return this.market.auth.getOAuthHandoff(id);
  }

  /**
   * Get user info from token
   */
  async getUserInfo(token: string) {
    return this.market.auth.getUserInfo(token);
  }

  /**
   * Get user info with trusted client token (server-side)
   */
  async getUserInfoWithTrustedClient(): Promise<never> {
    return unavailable('Cloud marketplace authentication');
  }

  /**
   * Refresh OAuth token
   */
  async refreshToken(params: { clientId: string; refreshToken: string }) {
    return this.market.auth.exchangeOAuthToken({
      clientId: params.clientId,
      grantType: 'refresh_token',
      refreshToken: params.refreshToken,
    });
  }

  // ============================== Client Methods ==============================

  /**
   * Register client for M2M authentication
   */
  async registerClient(params: {
    clientName: string;
    clientType: string;
    deviceId: string;
    platform?: string;
    version?: string;
  }) {
    // @ts-ignore
    return this.market.registerClient(params);
  }

  /**
   * Fetch M2M token with client credentials
   */
  async fetchM2MToken() {
    return this.market.fetchM2MToken();
  }

  // ============================== Skills Methods ==============================

  /**
   * List available tools for a provider
   */
  async listSkillTools(providerId: string) {
    return this.market.skills.listTools(providerId);
  }

  /**
   * Call a skill tool
   */
  async callSkillTool(provider: string, params: { args: Record<string, any>; tool: string }) {
    return this.market.skills.callTool(provider, params);
  }

  /**
   * List user's connected skills
   */
  async listSkillConnections() {
    return this.market.connect.listConnections();
  }

  // ============================== Plugin Methods ==============================

  /**
   * Call cloud MCP endpoint
   */
  async callCloudMcpEndpoint(
    params: {
      apiParams: Record<string, any>;
      identifier: string;
      toolName: string;
    },
    options?: {
      headers?: Record<string, string>;
    },
  ) {
    return this.market.plugins.callCloudGateway(params, options);
  }

  /**
   * Export file from sandbox to upload URL
   */
  async exportFile(params: { path: string; topicId: string; uploadUrl: string; userId: string }) {
    const { path, uploadUrl, topicId, userId } = params;

    return this.market.plugins.runBuildInTool(
      'exportFile',
      { path, uploadUrl },
      { topicId, userId },
    );
  }

  /**
   * Get plugin manifest
   */
  async getPluginManifest(params: {
    identifier: string;
    install?: boolean;
    locale?: string;
    version?: string;
  }) {
    return this.market.plugins.getPluginManifest(params);
  }

  /**
   * Report plugin installation
   */
  async reportPluginInstallation(params: any) {
    return this.market.plugins.reportInstallation(params);
  }

  /**
   * Report plugin call
   */
  async reportPluginCall(params: any) {
    return this.market.plugins.reportCall(params);
  }

  /**
   * Create plugin event
   */
  async createPluginEvent(params: any) {
    return this.market.plugins.createEvent(params);
  }

  // ============================== Agent Methods ==============================

  /**
   * Get agent detail
   */
  async getAgentDetail(identifier: string, options?: { locale?: string; version?: string }) {
    return this.market.agents.getAgentDetail(identifier, options);
  }

  /**
   * Get agent list
   */
  async getAgentList(params?: any) {
    return this.market.agents.getAgentList(params);
  }

  /**
   * Increase agent install count
   */
  async increaseAgentInstallCount(identifier: string) {
    return this.market.agents.increaseInstallCount(identifier);
  }

  /**
   * Create agent event
   */
  async createAgentEvent(params: any) {
    return this.market.agents.createEvent(params);
  }

  // ============================== Agent Group Methods ==============================

  /**
   * Get agent group detail
   */
  async getAgentGroupDetail(identifier: string, options?: { locale?: string; version?: number }) {
    return this.market.agentGroups.getAgentGroupDetail(identifier, options);
  }

  /**
   * Get agent group list
   */
  async getAgentGroupList(params?: any) {
    return this.market.agentGroups.getAgentGroupList(params);
  }

  // ============================== User Methods ==============================

  /**
   * Get user profile by username
   */
  async getUserProfile(username: string, options?: { locale?: string }) {
    return this.market.user.getUserInfo(username, options);
  }

  /**
   * Register user on market and optionally follow another user
   */
  async registerUser(params: { followUserId?: string; registerUserId: string }): Promise<void> {
    await this.market.user.register(params);
  }

  // ============================== Skills Methods (using SDK) ==============================

  /**
   * Search for skills in the LobeHub Market
   */
  async searchSkill(params: {
    category?: string;
    locale?: string;
    order?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    q?: string;
    sort?:
      | 'createdAt'
      | 'forks'
      | 'installCount'
      | 'name'
      | 'relevance'
      | 'stars'
      | 'updatedAt'
      | 'watchers';
  }) {
    log('searchSkill: %O', params);

    const result = await this.market.marketSkills.getSkillList(params);

    log('searchSkill response: %O', result);

    return result;
  }

  /**
   * Get skill detail from market
   */
  async getSkillDetail(identifier: string, options?: { locale?: string; version?: string }) {
    log('getSkillDetail: %s, options: %O', identifier, options);

    const result = await this.market.marketSkills.getSkillDetail(identifier, options);

    log('getSkillDetail response: %O', result);

    return result;
  }

  /**
   * Get skill download URL from market
   */
  getSkillDownloadUrl(identifier: string, version?: string): string {
    return this.market.marketSkills.getDownloadUrl(identifier, version);
  }

  /**
   * Download skill ZIP directly
   */
  async downloadSkill(identifier: string, version?: string) {
    log('downloadSkill: %s, version: %s', identifier, version);

    return this.market.marketSkills.downloadSkill(identifier, version);
  }

  /**
   * Get skill categories
   */
  async getSkillCategories() {
    log('getSkillCategories');

    return this.market.marketSkills.getCategories();
  }

  /**
   * Execute a LobeHub Skill tool
   * @param params - The skill execution parameters (provider, toolName, args)
   * @returns Execution result with content and success status
   */
  async executeLobehubSkill(params: LobehubSkillExecuteParams): Promise<LobehubSkillExecuteResult> {
    const { provider, toolName, args, context } = params;

    log('executeLobehubSkill: %s/%s with args: %O, context: %O', provider, toolName, args, context);

    try {
      const response = await this.market.skills.callTool(provider, {
        args,
        // @ts-ignore
        topicId: context?.topicId,
        tool: toolName,
      });

      log('executeLobehubSkill: response: %O', response);

      return {
        content: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
        success: response.success,
      };
    } catch (error) {
      const err = error as Error;
      console.error('MarketService.executeLobehubSkill error %s/%s: %O', provider, toolName, err);

      // MarketAPIError carries the full error response body from the API,
      // including structured details (command, exitCode, stdout, stderr).
      // Extract it so the content is not empty on failure.
      const errorBody = (err as any).errorBody;
      const skillError = errorBody?.error;
      const content = skillError ? JSON.stringify(skillError) : err.message;

      return {
        content,
        error: {
          code: skillError?.code || 'LOBEHUB_SKILL_ERROR',
          message: skillError?.message || err.message,
        },
        success: false,
      };
    }
  }

  /**
   * Fetch LobeHub Skills manifests from Market API
   * Gets user's connected skills and builds tool manifests for agent execution
   *
   * @returns Array of tool manifests for connected skills
   */
  async getLobehubSkillManifests(): Promise<LobeToolManifest[]> {
    // Local tools and locally installed MCP servers are resolved elsewhere.
    return [];
  }

  // ============================== Creds Methods ==============================

  /**
   * Upload credential file to Market API
   * This method directly calls the Market API since SDK doesn't support file upload yet
   *
   * @param file - File content as base64 string
   * @param fileName - Original file name
   * @param fileType - MIME type of the file
   * @returns Upload result with fileHashId
   */
  async uploadCredFile(params: {
    file: string; // base64 encoded file content
    fileName: string;
    fileType: string;
  }): Promise<{ fileHashId: string; fileName: string; fileSize: number; fileType: string }> {
    return unavailable('Cloud credential storage');
  }

  // ============================== Direct SDK Access ==============================

  /**
   * Get MarketSDK instance for advanced usage
   * Use this when you need direct access to SDK methods not wrapped by this service
   */
  getSDK(): MarketSDK {
    return this.market;
  }
}
