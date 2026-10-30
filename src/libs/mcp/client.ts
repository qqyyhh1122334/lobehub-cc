import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { type Progress } from '@modelcontextprotocol/sdk/types.js';
import debug from 'debug';

import {
  type MCPClientParams,
  type McpPrompt,
  type McpResource,
  type McpTool,
  type ToolCallResult,
} from './types';
import { createMCPError } from './types';

const log = debug('lobe-mcp:client');
// MCP tool call timeout (milliseconds), configurable via the environment variable MCP_TOOL_TIMEOUT, default is 60000
// Parse MCP_TOOL_TIMEOUT, only use if it's a valid positive number, otherwise fallback to default 60000
const MCP_TOOL_TIMEOUT = (() => {
  const val = Number(process.env.MCP_TOOL_TIMEOUT);
  return Number.isFinite(val) && val > 0 ? val : 60_000;
})();

export class MCPClient {
  private mcp: Client;
  private transport: Transport;
  private params: MCPClientParams;

  constructor(params: MCPClientParams) {
    this.params = params;
    this.mcp = new Client({ name: 'lobehub-mcp-client', version: '1.0.0' });

    switch (params.type) {
      case 'http': {
        log('Using HTTP transport with url: %s', params.url);

        // Build headers, including custom headers and authentication information
        const headers: Record<string, string> = { ...params.headers };

        // Handle authentication configuration
        if (params.auth) {
          switch (params.auth.type) {
            case 'bearer': {
              if (params.auth.token) {
                headers['Authorization'] = `Bearer ${params.auth.token}`;
                log('Added Bearer token authentication');
              }
              break;
            }
            case 'oauth2': {
              if (params.auth.accessToken) {
                headers['Authorization'] = `Bearer ${params.auth.accessToken}`;
                log('Added OAuth2 access token authentication');
              }
              break;
            }

            default: {
              // No authentication required
              break;
            }
          }
        }

        // Create StreamableHTTPClientTransport and pass headers
        this.transport = new StreamableHTTPClientTransport(new URL(params.url), {
          requestInit: { headers },
        });

        log('HTTP transport created with headers: %O', Object.keys(headers));

        break;
      }

      case 'stdio': {
        throw createMCPError(
          'VALIDATION_ERROR',
          'Local subprocess MCP is disabled in the intranet web build. Use an approved internal HTTP MCP endpoint.',
          { step: 'intranet_transport_policy' },
        );
      }

      default: {
        const err = createMCPError(
          'VALIDATION_ERROR',
          `Unsupported MCP connection type: ${(params as any).type}`,
          {
            params: { type: (params as any).type },
          },
        );
        log('Error creating client: %O', err);
        throw err;
      }
    }
  }

  async initialize(options: { onProgress?: (progress: Progress) => void } = {}) {
    log('Initializing MCP connection...');

    try {
      await this.mcp.connect(this.transport, { onprogress: options.onProgress });
      log('MCP connection initialized.');
    } catch (e) {
      log('MCP connection failed:', e);

      if (this.params.type === 'http') {
        const error = e as Error;
        if (error.message.includes('401'))
          throw createMCPError('AUTHORIZATION_ERROR', error.message);

        throw e;
      }

      // For other connection types or when pre-check doesn't provide more information
      if ((e as any).code === -32_000) {
        throw createMCPError(
          'CONNECTION_FAILED',
          'Failed to connect to MCP server, please check your configuration',
          {
            originalError: (e as Error).message,
            params: {
              args: this.params.args,
              command: this.params.command,
              type: this.params.type,
            },
            step: 'mcp_connect',
          },
        );
      }

      // Wrap other unknown errors
      throw createMCPError('UNKNOWN_ERROR', (e as Error).message, {
        originalError: (e as Error).message,
        params: {
          args: this.params.args,
          command: this.params.command,
          type: this.params.type,
        },
        step: 'mcp_connect',
      });
    }
  }

  async disconnect() {
    log('Disconnecting MCP connection...');
    // Assuming the mcp client has a disconnect method
    if (this.mcp && typeof (this.mcp as any).disconnect === 'function') {
      await (this.mcp as any).disconnect();
      log('MCP connection disconnected.');
    } else {
      log('MCP client does not have a disconnect method or is not initialized.');
      // Depending on the transport, we might need specific cleanup
      if (this.transport && typeof (this.transport as any).close === 'function') {
        (this.transport as any).close();
        log('Transport closed.');
      }
    }
  }

  async listTools() {
    try {
      log('Listing tools...');
      const { tools } = await this.mcp.listTools();
      log('Listed tools: %O', tools);
      return tools as McpTool[];
    } catch (e) {
      console.error('Listed tools error: %O', e);

      if ((e as Error).message.includes('No valid session ID provided')) {
        throw new Error('NoValidSessionId', { cause: e });
      }

      return [];
    }
  }

  async listResources() {
    try {
      log('Listing resources...');
      const { resources } = await this.mcp.listResources();
      log('Listed resources: %O', resources);
      return resources as McpResource[];
    } catch (e) {
      log('Listed resources: %O', e);
      return [];
    }
  }

  async listPrompts() {
    try {
      log('Listing prompts...');
      const { prompts } = await this.mcp.listPrompts();
      log('Listed prompts: %O', prompts);
      return prompts as McpPrompt[];
    } catch (e) {
      log('Listed prompts: %O', e);
      return [];
    }
  }

  async listManifests() {
    const capabilities = this.mcp.getServerCapabilities();
    log('get capabilities: %O', capabilities);

    const [tools, prompts, resources] = await Promise.all([
      this.listTools(),
      this.listPrompts(),
      this.listResources(),
    ]);

    const manifest = {
      prompts: prompts.length === 0 ? undefined : prompts,
      resources: resources.length === 0 ? undefined : resources,
      title: this.mcp.getServerVersion()?.title,
      tools: tools.length === 0 ? undefined : tools,
      version: this.mcp.getServerVersion()?.version?.replace('v', ''),
    };

    log('Listed Manifest: %O', manifest);

    return manifest;
  }

  async callTool(toolName: string, args: any): Promise<ToolCallResult> {
    log('Calling tool: %s with args: %O, timeout: %O', toolName, args, MCP_TOOL_TIMEOUT);
    const result = await this.mcp.callTool({ arguments: args, name: toolName }, undefined, {
      timeout: MCP_TOOL_TIMEOUT,
    });
    log('Tool call result: %O', result);
    return result as ToolCallResult;
  }
}
