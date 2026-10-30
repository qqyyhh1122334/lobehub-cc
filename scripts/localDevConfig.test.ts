import { describe, expect, it } from 'vitest';

import { resolveLocalDevConfig } from './localDevConfig';

describe('local full-stack dev configuration', () => {
  it('defaults both processes to local Next even with a remote standalone SPA backend', () => {
    const config = resolveLocalDevConfig([], { DEV_BACKEND_URL: 'https://remote.example.com' });

    expect(config.backendUrl).toBe('http://localhost:3010');
    expect(config.env).toEqual({
      APP_URL: 'http://localhost:3010',
      DEV_BACKEND_URL: 'http://localhost:3010',
      INTERNAL_APP_URL: 'http://localhost:3010',
      PORT: '3010',
    });
  });

  it.each([['-p', '4010'], ['--port', '4010'], ['--port=4010'], ['-p=4010']])(
    'passes the CLI port to both subprocesses for %j',
    (...args) => {
      const config = resolveLocalDevConfig(args, { PORT: '3010' });

      expect(config.port).toBe(4010);
      expect(config.env.PORT).toBe('4010');
      expect(config.env.DEV_BACKEND_URL).toBe('http://localhost:4010');
      expect(config.env.APP_URL).toBe('http://localhost:4010');
      expect(config.env.INTERNAL_APP_URL).toBe('http://localhost:4010');
    },
  );

  it('respects explicit application URLs and other shell or dotenv values', () => {
    const config = resolveLocalDevConfig([], {
      APP_URL: 'https://local.example.com',
      DATABASE_URL: 'postgresql://database.internal/lobechat',
      INTERNAL_APP_URL: 'http://localhost:5010',
      PORT: '5010',
    });

    expect(config.env.APP_URL).toBe('https://local.example.com');
    expect(config.env.INTERNAL_APP_URL).toBe('http://localhost:5010');
    expect(config.env.DATABASE_URL).toBe('postgresql://database.internal/lobechat');
    expect(config.env.DEV_BACKEND_URL).toBe('http://localhost:5010');
  });

  it.each(['0', '65536', '-1', '1.5', 'NaN', '1e3', ''])('rejects invalid CLI port %j', (port) => {
    expect(() => resolveLocalDevConfig(['-p', port], {})).toThrow('between 1 and 65535');
  });

  it('rejects missing CLI values and invalid environment ports before spawning processes', () => {
    expect(() => resolveLocalDevConfig(['-p'], {})).toThrow('requires a port');
    expect(() => resolveLocalDevConfig(['--port', '--other'], {})).toThrow('between 1 and 65535');
    expect(() => resolveLocalDevConfig([], { PORT: 'not-a-port' })).toThrow('between 1 and 65535');
  });
});
