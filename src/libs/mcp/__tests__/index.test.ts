// @vitest-environment node
import childProcess from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MCPClient } from '../index';

describe('MCPClient intranet transport policy', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['npx', 'uvx', 'curl', process.execPath])(
    'rejects stdio command %s before launching any process',
    (command) => {
      const spawn = vi.spyOn(childProcess, 'spawn');
      expect(
        () => new MCPClient({ name: 'untrusted', type: 'stdio', command, args: ['--version'] }),
      ).toThrow('Local subprocess MCP is disabled');
      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it('still constructs an internal HTTP MCP client', () => {
    expect(
      new MCPClient({ name: 'internal', type: 'http', url: 'http://127.0.0.1:9000/mcp' }),
    ).toBeInstanceOf(MCPClient);
  });

  it('initializes, lists and calls a tool on a real internal HTTP MCP server', async () => {
    const service = new McpServer({ name: 'intranet-test', version: '1.0.0' });
    service.registerTool('internal_status', {}, async () => ({
      content: [{ type: 'text', text: 'intranet tool works' }],
    }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });
    await service.connect(transport);
    const server = createServer((request, response) => {
      void transport.handleRequest(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No local MCP listener');
    const client = new MCPClient({
      name: 'internal',
      type: 'http',
      url: `http://127.0.0.1:${address.port}/mcp`,
    });
    try {
      await client.initialize();
      expect((await client.listTools()).map((tool) => tool.name)).toContain('internal_status');
      expect((await client.callTool('internal_status', {})).content).toEqual([
        { type: 'text', text: 'intranet tool works' },
      ]);
    } finally {
      await client.disconnect();
      await service.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('rejects unsupported connection types', () => {
    expect(() => new MCPClient({ name: 'invalid', type: 'invalid' } as any)).toThrow(
      'Unsupported MCP connection type: invalid',
    );
  });
});
