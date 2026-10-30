// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createDebugProxyUrl, resolveDevBackendUrl } from './devBackend';

describe('SPA development backend', () => {
  it('keeps the existing hosted backend by default', () => {
    expect(resolveDevBackendUrl()).toBe('https://app.lobehub.com');
  });

  it.each(['http://10.0.0.8:3210', 'https://chat.example.com', 'https://chat.example.com/'])(
    'accepts a self-hosted backend origin: %s',
    (value) => {
      expect(resolveDevBackendUrl(value)).toBe(new URL(value).origin);
    },
  );

  it.each([
    'not-a-url',
    'file:///tmp/backend',
    'https://user:secret@chat.example.com',
    'https://chat.example.com/lobehub',
    'https://chat.example.com?token=secret',
    'https://chat.example.com#fragment',
  ])('rejects a backend that is not a plain HTTP(S) origin: %s', (value) => {
    expect(() => resolveDevBackendUrl(value)).toThrow();
  });

  it('loads local frontend modules while keeping the selected backend origin', () => {
    const url = new URL(
      createDebugProxyUrl(resolveDevBackendUrl('https://chat.example.com'), 'http://localhost:9876/'),
    );

    expect(url.origin).toBe('https://chat.example.com');
    expect(url.pathname).toBe('/_dangerous_local_dev_proxy');
    expect(url.searchParams.get('debug-host')).toBe('http://localhost:9876');
  });

  it('uses the actual Vite port and supports loopback IPv6', () => {
    const url = new URL(createDebugProxyUrl('http://10.0.0.8:3210', 'http://[::1]:9877/'));

    expect(url.searchParams.get('debug-host')).toBe('http://[::1]:9877');
  });
});
