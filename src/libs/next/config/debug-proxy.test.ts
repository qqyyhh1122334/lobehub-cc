// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const serverConfig = {
  analyticsConfig: {},
  clientEnv: { marketBaseUrl: 'https://market.internal.example' },
  config: { aiProvider: {}, telemetry: {} },
  featureFlags: {},
  isMobile: false,
};

const devHtml = `<!doctype html><html><head>
  <script type="module">import RefreshRuntime from "/@react-refresh";
    window.__vite_plugin_react_preamble_installed__ = true;</script>
  <script type="module" src="/@vite/client"></script>
  <script>window.__SERVER_CONFIG__ = undefined; /* SERVER_CONFIG */</script>
  </head><body><div id="root"></div>
  <script type="module" crossorigin src="/src/spa/entry.web.tsx"></script>
  </body></html>`;

let initialize: () => Promise<void>;
let scripts: HTMLScriptElement[];
let configAtScriptLoad: unknown[];
let autoLoad: boolean;

function stubResponses(configResponse = Response.json(serverConfig), localResponse = new Response(devHtml)) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    return String(input).startsWith('/spa/') ? configResponse : localResponse;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeAll(async () => {
  const html = await readFile(new URL('../../../../public/_dangerous_local_dev_proxy.html', import.meta.url), 'utf8');
  const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  if (!source) throw new Error('Debug proxy bootstrap is missing');
  initialize = new Function('return (async () => {' + source + '\n})();') as () => Promise<void>;
});

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/_dangerous_local_dev_proxy');
  sessionStorage.clear();
  window.__SERVER_CONFIG__ = undefined;
  scripts = [];
  configAtScriptLoad = [];
  autoLoad = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // Module execution is the browser boundary: control load completion to expose ordering races.
  vi.spyOn(document.body, 'append').mockImplementation((...nodes) => {
    for (const node of nodes) {
      if (!(node instanceof HTMLScriptElement)) continue;
      scripts.push(node);
      configAtScriptLoad.push(window.__SERVER_CONFIG__);
      if (autoLoad) queueMicrotask(() => node.dispatchEvent(new Event('load')));
    }
  });
  // Avoid executing the Worker patch in the test environment.
  vi.spyOn(document.head, 'append').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('remote-origin debug proxy', () => {
  it('waits for JSON configuration before starting any local modules and preserves it', async () => {
    let resolveConfig!: (response: Response) => void;
    const pendingConfig = new Promise<Response>((resolve) => {
      resolveConfig = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      return String(input).startsWith('/spa/') ? await pendingConfig : new Response(devHtml);
    });
    vi.stubGlobal('fetch', fetchMock);

    const ready = initialize();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(scripts).toHaveLength(0);

    resolveConfig(Response.json(serverConfig));
    await ready;

    expect(fetchMock).toHaveBeenCalledWith('/spa/en-US/chat', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    expect(scripts).toHaveLength(3);
    expect(configAtScriptLoad).toEqual([serverConfig, serverConfig, serverConfig]);
    expect(window.__SERVER_CONFIG__).toEqual(serverConfig);
    expect(scripts.some((script) => script.textContent?.includes('SERVER_CONFIG'))).toBe(false);
  });

  it('finishes React Refresh before the Vite client and entry modules', async () => {
    stubResponses();
    autoLoad = false;
    const ready = initialize();

    await vi.waitFor(() => expect(scripts).toHaveLength(1));
    expect(scripts[0].textContent).toContain('from "http://localhost:9876/@react-refresh"');
    scripts[0].dispatchEvent(new Event('load'));

    await vi.waitFor(() => expect(scripts).toHaveLength(2));
    expect(scripts[1].src).toBe('http://localhost:9876/@vite/client');
    scripts[1].dispatchEvent(new Event('load'));

    await vi.waitFor(() => expect(scripts).toHaveLength(3));
    expect(scripts[2].src).toBe('http://localhost:9876/src/spa/entry.web.tsx');
    expect(scripts.every((script) => script.type === 'module' && !script.async)).toBe(true);
    scripts[2].dispatchEvent(new Event('load'));
    await ready;
  });

  it('supports older backends that return configuration in SPA HTML', async () => {
    stubResponses(new Response(`<script>window.__SERVER_CONFIG__ = ${JSON.stringify(serverConfig)};</script>`, {
      headers: { 'content-type': 'text/html' },
    }));

    await initialize();

    expect(scripts).toHaveLength(3);
    expect(configAtScriptLoad).toEqual([serverConfig, serverConfig, serverConfig]);
  });

  it.each([
    ['backend', 503, 'Backend configuration'],
    ['local', 502, 'Local Vite server'],
  ] as const)('shows %s HTTP failures without starting local modules', async (side, status, label) => {
    stubResponses(
      side === 'backend' ? new Response('', { status }) : Response.json(serverConfig),
      side === 'local' ? new Response('', { status }) : new Response(devHtml),
    );

    await initialize();

    expect(document.body.textContent).toContain(`${label} returned HTTP ${status}`);
    expect(scripts).toHaveLength(0);
  });

  it('shows missing server configuration instead of booting with local defaults', async () => {
    stubResponses(new Response('<html>Sign in</html>'));

    await initialize();

    expect(document.body.textContent).toContain('did not return SPA server configuration');
    expect(scripts).toHaveLength(0);
  });

  it.each([
    'https://example.com',
    'http://localhost.example.com:9876',
    'ftp://localhost:9876',
    'http://user:password@localhost:9876',
  ])('keeps development resources on loopback for invalid host %s', async (host) => {
    window.history.replaceState({}, '', `/_dangerous_local_dev_proxy?debug-host=${encodeURIComponent(host)}`);
    const fetchMock = stubResponses();

    await initialize();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:9876', { cache: 'no-store' });
    expect(sessionStorage.getItem('debug-host')).toBeNull();
  });

  it.each(['http://127.0.0.1:9877', 'http://[::1]:9877'])('accepts the loopback development host %s', async (host) => {
    window.history.replaceState({}, '', `/_dangerous_local_dev_proxy?debug-host=${encodeURIComponent(host)}`);
    const fetchMock = stubResponses();

    await initialize();

    expect(fetchMock).toHaveBeenCalledWith(host, { cache: 'no-store' });
    expect(scripts[1].src).toBe(`${host}/@vite/client`);
  });

  it('shows a failed development module and does not start its dependents', async () => {
    stubResponses();
    autoLoad = false;
    const ready = initialize();
    await vi.waitFor(() => expect(scripts).toHaveLength(1));
    scripts[0].dispatchEvent(new Event('error'));
    await ready;

    expect(document.body.textContent).toContain('Unable to load a development script');
    expect(scripts).toHaveLength(1);
  });
});
