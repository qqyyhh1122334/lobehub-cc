// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lobechat/business-const', () => ({ BRANDING_NAME: 'LobeHub', ORG_NAME: 'LobeHub' }));
vi.mock('@lobechat/const', () => ({ OG_URL: 'https://example.com/og.png' }));
vi.mock('@/config/featureFlags', () => ({ getServerFeatureFlagsValue: () => ({ test: true }) }));
vi.mock('@/const/url', () => ({ OFFICIAL_URL: 'https://example.com' }));
vi.mock('@/const/version', () => ({ isCustomORG: false, isDesktop: false }));
vi.mock('@/envs/analytics', () => ({ analyticsEnv: {} }));
vi.mock('@/envs/app', () => ({ appEnv: { MARKET_BASE_URL: 'https://market.example.com' } }));
vi.mock('@/envs/file', () => ({ fileEnv: { NEXT_PUBLIC_S3_FILE_PATH: '/files' } }));
vi.mock('@/envs/python', () => ({ pythonEnv: {} }));
vi.mock('@/server/globalConfig', () => ({
  getServerGlobalConfig: async () => ({ aiProvider: {}, telemetry: {} }),
}));
vi.mock('@/server/translation', () => ({ translation: async () => ({ t: () => 'LobeHub' }) }));
vi.mock('@/utils/server/routeVariants', () => ({
  RouteVariants: {
    deserializeVariants: (value: string) => ({ locale: 'en-US', isMobile: value.endsWith('__1') }),
  },
}));

describe('SPA configuration for a remote frontend', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns backend configuration without contacting a local Vite server', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No Vite in Docker'));
    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://chat.example.com/spa/en-US/chat', {
        headers: { accept: 'application/json' },
      }),
      { params: Promise.resolve({ variants: 'en-US' }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(await response.json()).toMatchObject({
      clientEnv: { marketBaseUrl: 'https://market.example.com', s3FilePath: '/files' },
      config: { aiProvider: {}, telemetry: {} },
      featureFlags: { test: true },
      isMobile: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('preserves the requested mobile variant in configuration', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://chat.example.com/spa/en-US__1/chat', {
        headers: { accept: 'application/json' },
      }),
      { params: Promise.resolve({ variants: 'en-US__1' }) },
    );

    expect(await response.json()).toHaveProperty('isMobile', true);
  });

  it('continues to render HTML for normal full-stack development requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        '<html><head><script>window.__SERVER_CONFIG__ = undefined; /* SERVER_CONFIG */</script></head><body><div id="root"></div></body></html>',
      ),
    );
    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://chat.example.com/spa/en-US/chat', { headers: { accept: 'text/html' } }),
      { params: Promise.resolve({ variants: 'en-US' }) },
    );
    const html = await response.text();

    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(html).toContain('window.__SERVER_CONFIG__ = {');
    expect(html).toContain('https://market.example.com');
    expect(html).not.toContain('/* SERVER_CONFIG */');
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:9876');
  });
});
