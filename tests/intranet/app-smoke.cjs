/* Actual built-app smoke; requires a completed Next build and installed Chromium.
 * No database, auth API, model response, or app asset is mocked. This checks only
 * anonymous UI. Full migration/login/chat/upload acceptance remains a separate gate.
 * Exit codes: 0 passed scoped smoke, 1 failed, 2 prerequisite blocked.
 */
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { pathToFileURL } = require('node:url');
const { resolvePlaywright } = require('./playwright-runtime.cjs');

const root = path.resolve(__dirname, '../..');
const output = path.resolve(
  process.env.INTRANET_SMOKE_OUTPUT || path.join(root, '.next/intranet-smoke'),
);
const port = Number(process.env.INTRANET_SMOKE_PORT || 3210);
const origin = `http://127.0.0.1:${port}`;
const report = {
  scope: 'Built Next application anonymous frontend only',
  database:
    'Intentionally nonexistent local PostgreSQL endpoint; no migrations or auth submissions',
  status: 'running',
  pages: [],
  spaTemplates: [],
  pageErrors: [],
  brokenBundles: [],
  brokenAssets: [],
  brokenImages: [],
  apiErrors: [],
  externalSafetyAborts: [],
  externalResponses: [],
  externalRequests: [],
  unexpectedExternalRequests: [],
  policyViolations: [],
  unexpectedPolicyViolations: [],
  failedRequests: [],
  localBundleResponses: 0,
  forbiddenSinkRequests: 0,
  limitations: [
    'No database migrations, account creation, authenticated chat, model inference, or upload were tested.',
  ],
};
const seen = new Set();
const add = (key, value) => {
  const stamp = `${key}:${JSON.stringify(value)}`;
  if (!seen.has(stamp) && report[key].length < 200) {
    seen.add(stamp);
    report[key].push(value);
  }
};
const isLocal = (url) => {
  try {
    return new URL(url).origin.replace(/^ws/, 'http') === origin;
  } catch {
    return false;
  }
};
const isNetwork = (url) => /^https?:|^wss?:/.test(url);
const isBundle = (url) =>
  /\/(?:_next\/static|_spa\/(?:assets|vendor))\//.test(url) ||
  /\/intranet-browser-guard\.js$/.test(url);
const isAsset = (type) => ['image', 'stylesheet', 'font', 'script', 'media'].includes(type);
let server;
let browser;
let denied;
let childLog = '';
let childExit;
let closing = false;
const standaloneOriginal = path.join(root, '.next/standalone');
let isolatedRuntime;
let isolatedParent;

async function unusedPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const value = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return value;
}
async function ensurePortAvailable() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
}
async function waitReady() {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    if (childExit !== undefined)
      throw new Error(`Next exited before readiness (code ${childExit})`);
    try {
      const res = await fetch(origin + '/signin', {
        redirect: 'manual',
        signal: AbortSignal.timeout(1500),
      });
      await res.body?.cancel();
      return;
    } catch {}
    await delay(250);
  }
  throw new Error('Next did not answer /signin within 90 seconds');
}
async function inspectVisibleImages(page) {
  await page.waitForFunction(
    () => [...document.images].every((img) => !img.getClientRects().length || img.complete),
    undefined,
    { timeout: 10_000 },
  );
  for (const image of await page.evaluate(() =>
    [...document.images]
      .filter((img) => img.getClientRects().length && img.naturalWidth === 0)
      .map((img) => ({ src: img.currentSrc || img.src, alt: img.alt })),
  ))
    add('brokenImages', image);
  assert.equal(report.brokenImages.length, 0, 'Visible image failed to render');
}
async function run() {
  if (!fs.existsSync(path.join(root, '.next/BUILD_ID'))) {
    report.status = 'blocked';
    report.reason = 'Completed production Next build is missing (.next/BUILD_ID).';
    return;
  }
  report.buildId = fs.readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim();
  if (!fs.existsSync(path.join(standaloneOriginal, 'server.js'))) {
    report.status = 'blocked';
    report.reason =
      'Actual standalone/server.js is missing; fallback to builder next start is forbidden.';
    return;
  }
  assert.ok(
    !process.env.INTRANET_SMOKE_MODE || process.env.INTRANET_SMOKE_MODE === 'standalone',
    'This smoke only runs the actual standalone artifact',
  );
  assert.ok(
    Number.isInteger(port) && port > 1024 && port < 65536,
    'Use an unprivileged local port',
  );
  await ensurePortAvailable();
  const { INTRANET_CSP } = await import(
    pathToFileURL(path.join(root, 'src/security/intranet/browserPolicy.ts'))
  );
  // Assemble exactly the non-module files copied by the Docker runtime stage.
  // This is host execution of the artifact, not a Docker build or container test.
  for (const relative of ['public', '.next/static', 'scripts/intranet']) {
    const source = path.join(root, relative);
    assert.ok(fs.existsSync(source), `Required runtime assembly input is missing: ${relative}`);
    fs.cpSync(source, path.join(standaloneOriginal, relative), { recursive: true, force: true });
  }
  isolatedParent = fs.mkdtempSync(path.join(os.tmpdir(), 'lobehub-app-smoke-'));
  isolatedRuntime = path.join(isolatedParent, 'runtime');
  fs.renameSync(standaloneOriginal, isolatedRuntime);
  report.runtimeAssembly = ['public', '.next/static', 'scripts/intranet'];
  report.isolatedRuntime = true;
  report.limitations.push(
    'The Docker runtime copy steps were reproduced on the host; Docker, TLS ingress and kernel firewall were not run.',
  );
  const dbPort = await unusedPort();
  const secret = () => randomBytes(32).toString('base64');
  // Build an explicit child environment: do not inherit real service credentials,
  // proxy settings, NODE_OPTIONS, or unrelated enabled cloud integrations.
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: 'C.UTF-8',
    TZ: 'UTC',
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    NODE_OPTIONS: `--max-old-space-size=2048 --require=${JSON.stringify(path.join(__dirname, 'standalone-resolution.cjs'))} --require=${JSON.stringify(path.join(isolatedRuntime, 'scripts/intranet/network-guard.cjs'))}`,
    NODE_PATH: '',
    INTRANET_SMOKE_RUNTIME_ROOT: isolatedRuntime,
    APP_URL: origin,
    INTERNAL_APP_URL: origin,
    MIDDLEWARE_REWRITE_THROUGH_LOCAL: '1',
    AUTH_SECRET: secret(),
    KEY_VAULTS_SECRET: secret(),
    AUTH_ALLOWED_EMAILS: 'smoke@lobehub.internal',
    AUTH_TRUSTED_ORIGINS: origin,
    AUTH_SSO_PROVIDERS: '',
    AUTH_DISABLE_EMAIL_PASSWORD: '0',
    AUTH_EMAIL_VERIFICATION: '0',
    AUTH_ENABLE_MAGIC_LINK: '0',
    DATABASE_DRIVER: 'node',
    DATABASE_URL: `postgresql://unused:unused@127.0.0.1:${dbPort}/intranet_smoke_nonexistent?connect_timeout=2`,
    REDIS_URL: '',
    S3_ENDPOINT: origin,
    S3_BUCKET: 'lobehub-files',
    S3_ACCESS_KEY_ID: 'unused-local-smoke',
    S3_SECRET_ACCESS_KEY: secret(),
    S3_REGION: 'us-east-1',
    S3_ENABLE_PATH_STYLE: '1',
    S3_SET_ACL: '0',
    ENABLED_OPENAI: '0',
    ENABLED_OLLAMA: '1',
    OLLAMA_PROXY_URL: `http://127.0.0.1:${dbPort}`,
    OLLAMA_MODEL_LIST: 'qwen3:8b',
    LOBE_INTRANET_ALLOWED_ENDPOINTS: `127.0.0.1:${port},localhost:${port},127.0.0.1:${dbPort}`,
    FEATURE_FLAGS: '-market,-community,-ai_image,-ai_video',
  };
  for (const name of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'NO_PROXY',
    'no_proxy',
    'PROXY_URL',
  ])
    env[name] = '';
  const standalone = path.join(isolatedRuntime, 'server.js');
  report.server = 'standalone';
  server = spawn(process.execPath, [standalone], {
    cwd: isolatedRuntime,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.once('exit', (code, signal) => {
    childExit = code ?? signal;
  });
  server.once('error', (error) => {
    childExit = error.message;
  });
  const secrets = [env.AUTH_SECRET, env.KEY_VAULTS_SECRET, env.S3_SECRET_ACCESS_KEY];
  const log = (chunk) => {
    let text = String(chunk);
    for (const value of secrets) text = text.split(value).join('[redacted ephemeral smoke secret]');
    childLog = (childLog + text).slice(-500_000);
  };
  server.stdout.on('data', log);
  server.stderr.on('data', log);
  await waitReady();
  denied = http.createServer((_req, res) => {
    report.forbiddenSinkRequests++;
    res.end('forbidden local sink');
  });
  await new Promise((resolve, reject) => {
    denied.once('error', reject);
    denied.listen(0, '127.0.0.1', resolve);
  });
  const forbidden = `http://127.0.0.1:${denied.address().port}`;
  const { chromium } = require(resolvePlaywright(root));
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      ...JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS || '[]'),
    ],
  });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.exposeBinding('__recordSmokeCsp', (_source, violation) => {
    add('policyViolations', violation);
    if (violation.blockedURI !== forbidden + '/image') add('unexpectedPolicyViolations', violation);
  });
  await context.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (event) => {
      globalThis.__recordSmokeCsp({
        blockedURI: event.blockedURI,
        directive: event.effectiveDirective,
      });
    }),
  );
  await context.routeWebSocket('**', (route) => {
    if (!isLocal(route.url())) {
      add('externalSafetyAborts', { url: route.url(), type: 'websocket' });
      route.close();
    } else route.connectToServer();
  });
  context.on('request', (request) => {
    if (isNetwork(request.url()) && !isLocal(request.url())) {
      add('externalRequests', { url: request.url(), type: request.resourceType() });
      if (request.url() !== forbidden + '/image')
        add('unexpectedExternalRequests', { url: request.url(), type: request.resourceType() });
    }
  });
  context.on('requestfailed', (request) => {
    const record = {
      url: request.url(),
      type: request.resourceType(),
      error: request.failure()?.errorText,
    };
    add('failedRequests', record);
    if (isLocal(record.url) && isBundle(record.url) && record.error !== 'net::ERR_ABORTED')
      add('brokenBundles', record);
    if (isLocal(record.url) && isAsset(record.type) && record.error !== 'net::ERR_ABORTED')
      add('brokenAssets', record);
  });
  context.on('response', (response) => {
    const url = response.url();
    const status = response.status();
    const type = response.request().resourceType();
    if (isNetwork(url) && !isLocal(url)) add('externalResponses', { url, status });
    if (isLocal(url) && isBundle(url)) {
      report.localBundleResponses++;
      if (status >= 400 || /text\/html/.test(response.headers()['content-type'] || ''))
        add('brokenBundles', { url, status, contentType: response.headers()['content-type'] });
    }
    if (
      isLocal(url) &&
      isAsset(type) &&
      (status >= 400 || /text\/html/.test(response.headers()['content-type'] || ''))
    )
      add('brokenAssets', { url, status, type, contentType: response.headers()['content-type'] });
    if (isLocal(url) && /\/(?:api|trpc|webapi)\//.test(url) && status >= 500)
      add('apiErrors', { url, status });
  });
  const page = await context.newPage();
  // Playwright context.route automatically aborts every /favicon.ico request,
  // even when our callback would allow it. CDP interception preserves the real
  // image behavior and still makes any external transport attempt a FAILURE.
  const cdp = await context.newCDPSession(page);
  cdp.on('Fetch.requestPaused', async (event) => {
    const url = event.request.url;
    try {
      if (isNetwork(url) && !isLocal(url) && !url.startsWith(forbidden + '/')) {
        add('externalSafetyAborts', { url, type: event.resourceType });
        await cdp.send('Fetch.failRequest', {
          requestId: event.requestId,
          errorReason: 'BlockedByClient',
        });
      } else {
        await cdp.send('Fetch.continueRequest', { requestId: event.requestId });
      }
    } catch (error) {
      if (!closing)
        add('pageErrors', { message: `Browser network interception failed: ${error.message}` });
    }
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  page.on('pageerror', (error) =>
    add('pageErrors', { message: error.message, stack: error.stack }),
  );
  const response = await page.goto(origin + '/signin', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const csp = response?.headers()['content-security-policy'];
  const normalizeCsp = (value) =>
    value
      ?.split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .join(';');
  assert.equal(
    normalizeCsp(csp),
    normalizeCsp(INTRANET_CSP),
    'Signin must include the complete immutable CSP',
  );
  // Authentication may prevent mounting the SPA, but the real deployed mobile
  // and desktop templates and every bootstrap URL can still be checked without
  // inventing a user session or mocking a database.
  const checkedSpaResources = new Set();
  for (const variant of ['en-US__0', 'en-US__1']) {
    const templateResponse = await fetch(`${origin}/spa/${variant}`, { redirect: 'error' });
    assert.equal(templateResponse.status, 200, `SPA template ${variant} must be available`);
    assert.equal(
      normalizeCsp(templateResponse.headers.get('content-security-policy')),
      normalizeCsp(INTRANET_CSP),
    );
    const html = await templateResponse.text();
    const resources = [
      ...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi),
    ].map((match) => new URL(match[1], origin));
    assert.ok(resources.length > 5, `SPA template ${variant} has no built bootstrap resources`);
    assert.equal(
      resources[0].pathname,
      '/_spa/intranet-browser-guard.js',
      'SPA guard must precede modules',
    );
    for (const resource of resources) {
      assert.equal(resource.origin, origin, `External resource in ${variant} bootstrap`);
      if (checkedSpaResources.has(resource.href)) continue;
      const asset = await fetch(resource.href, { method: 'HEAD', redirect: 'error' });
      const type = asset.headers.get('content-type') || '';
      assert.equal(asset.status, 200, `Missing SPA bootstrap resource: ${resource.pathname}`);
      assert.ok(!type.includes('text/html'), `SPA asset returned HTML: ${resource.pathname}`);
      checkedSpaResources.add(resource.href);
    }
    report.spaTemplates.push({ variant, status: 'passed', bootstrapResources: resources.length });
  }
  report.localSpaResources = checkedSpaResources.size;
  assert.ok(response && response.status() < 400, `Signin returned HTTP ${response?.status()}`);
  assert.equal(
    await page.evaluate(() => !!globalThis.__INTRANET_BROWSER_GUARD__),
    true,
    'Early browser guard must be active',
  );
  const servedGuard = await page.evaluate(() =>
    fetch('/intranet-browser-guard.js').then((res) => res.text()),
  );
  const guardHash = (content) => createHash('sha256').update(content).digest('hex');
  report.browserGuardSha256 = guardHash(servedGuard);
  assert.equal(
    report.browserGuardSha256,
    guardHash(fs.readFileSync(path.join(root, 'public/intranet-browser-guard.js'))),
    'The built app must serve the current browser policy guard',
  );
  const spaGuard = await page.evaluate(() =>
    fetch('/_spa/intranet-browser-guard.js').then((res) => res.text()),
  );
  assert.equal(
    guardHash(spaGuard),
    report.browserGuardSha256,
    'The SPA bootstrap prefix must serve the same guard before its application scripts',
  );
  report.iconResponses = [];
  for (const url of [
    '/favicon.ico',
    '/favicon-32x32.ico',
    '/_spa/favicon.ico',
    '/_spa/favicon-32x32.ico',
  ]) {
    const icon = await fetch(origin + url, { redirect: 'error', cache: 'no-store' });
    const bytes = Buffer.from(await icon.arrayBuffer());
    report.iconResponses.push({
      url,
      status: icon.status,
      headers: Object.fromEntries(icon.headers),
      bytes: bytes.length,
      sha256: guardHash(bytes),
    });
  }
  report.localIcons = await page.evaluate(async () =>
    Promise.all(
      ['/favicon.ico', '/favicon-32x32.ico', '/_spa/favicon.ico', '/_spa/favicon-32x32.ico'].map(
        (src) =>
          new Promise((resolve) => {
            const img = new Image();
            const timer = setTimeout(() => resolve({ src, width: 0, error: 'timeout' }), 10_000);
            img.onload = () => {
              clearTimeout(timer);
              resolve({ src, width: img.naturalWidth });
            };
            img.onerror = () => {
              clearTimeout(timer);
              resolve({ src, width: 0, error: 'decode or load failure' });
            };
            img.src = src;
          }),
      ),
    ),
  );
  assert.ok(
    report.localIcons.every((icon) => icon.width > 0),
    'All local logo fallbacks and SPA favicons must decode as images',
  );
  const email = page
    .locator('input[type="email"], input[autocomplete="email"], input[name="email"], input#email')
    .first();
  await email.waitFor({ state: 'visible', timeout: 30_000 });
  await email.fill('smoke@lobehub.internal');
  assert.equal(await email.inputValue(), 'smoke@lobehub.internal');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'signin.png'), fullPage: true });
  await inspectVisibleImages(page);
  report.localMathFonts = await page.evaluate(async () => {
    const fonts = await document.fonts.load('16px KaTeX_Main', 'x');
    return fonts.filter((font) => font.status === 'loaded').length;
  });
  assert.ok(report.localMathFonts > 0, 'Bundled KaTeX stylesheet and local font must load');
  report.pages.push({
    path: '/signin',
    status: 'passed',
    hydratedEmailInput: true,
    csp: true,
    browserGuard: true,
  });
  const probes = await page.evaluate(async (forbidden) => {
    let fetchError;
    try {
      await fetch(forbidden + '/fetch');
    } catch (error) {
      fetchError = error.name;
    }
    const img = new Image();
    img.src = forbidden + '/image';
    document.body.append(img);
    await new Promise((resolve) => setTimeout(resolve, 300));
    img.remove();
    return { fetchError };
  }, forbidden);
  assert.equal(
    probes.fetchError,
    'SecurityError',
    'Real app fetch guard must reject cross-origin target',
  );
  const spaResponse = await page.goto(origin + '/', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  assert.ok(
    spaResponse && spaResponse.status() < 400,
    `SPA navigation returned HTTP ${spaResponse?.status()}`,
  );
  assert.equal(
    normalizeCsp(spaResponse.headers()['content-security-policy']),
    normalizeCsp(INTRANET_CSP),
    'SPA or its auth redirect must enforce the complete CSP',
  );
  if (new URL(page.url()).pathname === '/signin') {
    await email.waitFor({ state: 'visible', timeout: 30_000 });
    assert.equal(await page.evaluate(() => !!globalThis.__INTRANET_BROWSER_GUARD__), true);
    report.pages.push({ path: '/', status: 'authentication-required', redirectedTo: '/signin' });
  } else {
    assert.ok(
      spaResponse && spaResponse.status() < 400,
      `SPA returned HTTP ${spaResponse?.status()}`,
    );
    await page.waitForFunction(
      () => !!document.querySelector('#root')?.childElementCount,
      undefined,
      { timeout: 30_000 },
    );
    assert.equal(await page.evaluate(() => !!globalThis.__INTRANET_BROWSER_GUARD__), true);
    report.pages.push({ path: '/', status: 'passed', mountedRoot: true });
    await page.screenshot({ path: path.join(output, 'spa.png'), fullPage: true });
  }
  await delay(500);
  await inspectVisibleImages(page);
  assert.ok(report.localBundleResponses > 0, 'No actual built JS/CSS resources loaded');
  assert.equal(report.brokenBundles.length, 0, 'Built resource load failure');
  assert.equal(report.brokenAssets.length, 0, 'Local image, font or stylesheet load failure');
  assert.equal(report.unexpectedPolicyViolations.length, 0, 'App generated a CSP violation');
  assert.equal(report.unexpectedExternalRequests.length, 0, 'App still references external assets');
  assert.equal(report.pageErrors.length, 0, 'Uncaught browser exception');
  assert.equal(report.apiErrors.length, 0, 'Anonymous UI API returned server error');
  assert.equal(
    report.externalSafetyAborts.length,
    0,
    'App attempted external transport beyond its guard/CSP',
  );
  assert.equal(report.externalResponses.length, 0, 'Browser received an external response');
  assert.equal(report.forbiddenSinkRequests, 0, 'Cross-origin probe reached its sink');
  report.status = 'passed';
}
run()
  .catch((error) => {
    const hasDefect =
      report.externalSafetyAborts.length ||
      report.externalResponses.length ||
      report.forbiddenSinkRequests ||
      report.brokenBundles.length ||
      report.brokenAssets.length ||
      report.brokenImages.length ||
      report.unexpectedPolicyViolations.length ||
      report.unexpectedExternalRequests.length;
    const missingDatabase =
      !hasDefect &&
      /ECONNREFUSED|database.*(?:does not exist|connection)|connect.*127\.0\.0\.1/i.test(childLog);
    const missingBrowser =
      /Executable doesn't exist|browserType.launch.*executable|Cannot find module 'playwright'/i.test(
        String(error),
      );
    report.status = missingDatabase || missingBrowser ? 'blocked' : 'failed';
    report.reason = error.message;
    if (missingDatabase)
      report.prerequisite =
        'A real migrated local PostgreSQL database is required for this route; this smoke intentionally provides none.';
    if (missingBrowser)
      report.prerequisite =
        'An installed local Playwright Chromium binary is required; the harness does not download one.';
  })
  .finally(async () => {
    closing = true;
    if (browser) await browser.close().catch(() => {});
    if (
      report.status === 'passed' &&
      (report.pageErrors.length ||
        report.brokenBundles.length ||
        report.brokenAssets.length ||
        report.brokenImages.length ||
        report.unexpectedPolicyViolations.length ||
        report.unexpectedExternalRequests.length ||
        report.apiErrors.length ||
        report.externalSafetyAborts.length ||
        report.externalResponses.length ||
        report.forbiddenSinkRequests ||
        childExit !== undefined)
    ) {
      report.status = 'failed';
      report.reason = 'A late browser failure or unexpected Next exit occurred before cleanup.';
    }
    if (denied) {
      denied.closeAllConnections();
      await new Promise((resolve) => denied.close(resolve));
    }
    if (server && childExit === undefined) {
      server.kill('SIGTERM');
      for (let n = 0; n < 20 && childExit === undefined; n++) await delay(100);
      if (childExit === undefined) {
        server.kill('SIGKILL');
        for (let n = 0; n < 10 && childExit === undefined; n++) await delay(100);
      }
    }
    if (isolatedRuntime && fs.existsSync(isolatedRuntime)) {
      try {
        fs.renameSync(isolatedRuntime, standaloneOriginal);
        fs.rmdirSync(isolatedParent);
      } catch (error) {
        report.status = 'failed';
        report.reason = `Could not restore standalone; preserved at ${isolatedRuntime}: ${error.message}`;
      }
    }
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'server.log'), childLog);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exitCode = report.status === 'passed' ? 0 : report.status === 'blocked' ? 2 : 1;
  });
