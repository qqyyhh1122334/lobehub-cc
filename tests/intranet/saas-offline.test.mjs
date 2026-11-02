/** Run with Node >= 24: node --test tests/intranet/saas-offline.test.mjs.
 * Loads the actual TypeScript modules with Node's type stripping, without downloading dependencies.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      return next(pathToFileURL(`${root}src/${specifier.slice(2)}.ts`).href, context);
    }
    if (specifier.startsWith('./') && !/\.[mc]?[jt]s$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});
const load = (path) => import(pathToFileURL(`${root}${path}`).href);
const { qstashClient, verifyQStashSignature, workflowClient } = await load(
  'src/libs/qstash/index.ts',
);
const { getKlavisConfig } = await load('src/config/klavis.ts');
const { KlavisService } = await load('src/server/services/klavis/index.ts');
const { EdgeConfig } = await load('packages/edge-config/src/index.ts');
const { disabledCloudRoute } = await load('src/libs/intranet/disabled.ts');

await test('removed SaaS capabilities reject independently of legacy environment flags', async (t) => {
  const originalFetch = globalThis.fetch;
  const keys = [
    'QSTASH_TOKEN',
    'KLAVIS_API_KEY',
    'QSTASH_CURRENT_SIGNING_KEY',
    'VERCEL_EDGE_CONFIG',
    'INTRANET_EDGE_CONFIG_JSON',
  ];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error('Unexpected network call');
  };
  process.env.QSTASH_TOKEN = 'old-token';
  process.env.KLAVIS_API_KEY = 'old-token';
  process.env.QSTASH_CURRENT_SIGNING_KEY = 'old-signing-key';
  process.env.VERCEL_EDGE_CONFIG = 'https://example.com/config';
  delete process.env.INTRANET_EDGE_CONFIG_JSON;
  try {
    await t.test('QStash publish fails explicitly', () =>
      assert.rejects(qstashClient.publishJSON({ url: 'https://example.com' }), {
        code: 'INTRANET_FEATURE_DISABLED',
      }),
    );
    await t.test('workflow trigger fails explicitly', () =>
      assert.rejects(workflowClient.trigger({ url: 'https://example.com' }), {
        code: 'INTRANET_FEATURE_DISABLED',
      }),
    );
    await t.test('retired cloud signatures never authenticate requests', async () => {
      assert.equal(
        await verifyQStashSignature(
          new Request('http://localhost', { headers: { 'Upstash-Signature': 'old-signature' } }),
          '{}',
        ),
        false,
      );
    });
    await t.test('Klavis keys cannot re-enable the feature', () =>
      assert.equal(getKlavisConfig().KLAVIS_API_KEY, undefined),
    );
    await t.test('old Klavis manifests are not advertised', async () =>
      assert.deepEqual(await new KlavisService().getKlavisManifests(), []),
    );
    await t.test('old Klavis tools fail clearly', async () => {
      const result = await new KlavisService().executeKlavisTool({
        args: {},
        identifier: 'gmail',
        toolName: 'sendEmail',
      });
      assert.equal(result.success, false);
      assert.equal(result.error.code, 'INTRANET_FEATURE_DISABLED');
    });
    await t.test('cloud routes report 410', async () => {
      const response = disabledCloudRoute();
      assert.equal(response.status, 410);
      assert.equal((await response.json()).error, 'INTRANET_FEATURE_DISABLED');
    });
    await t.test('Vercel URL cannot activate configuration', () =>
      assert.equal(EdgeConfig.isEnabled(), false),
    );
    await t.test('operator JSON is read locally', async () => {
      process.env.INTRANET_EDGE_CONFIG_JSON = '{"feature_flags":{"market":false}}';
      assert.deepEqual(await new EdgeConfig().getFeatureFlags(), { market: false });
    });
    await t.test('invalid configuration is rejected', async () => {
      process.env.INTRANET_EDGE_CONFIG_JSON = '[]';
      await assert.rejects(new EdgeConfig().getFeatureFlags(), /JSON object/);
    });
    await t.test('none of the removed capabilities attempted fetch', () =>
      assert.equal(requests, 0),
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

const cloudRouteRoots = [
  'src/app/(backend)/api/workflows/agent-eval-run',
  'src/app/(backend)/api/webhooks/memory-user-memory',
  'src/app/(backend)/api/webhooks/memory-extraction',
];
for (const base of cloudRouteRoots) {
  for (const file of readdirSync(`${root}${base}`, { recursive: true })) {
    if (!file.endsWith('route.ts')) continue;
    await test(`retired HTTP endpoint ${base}/${file} rejects before any input or DB access`, async () => {
      const route = await load(`${base}/${file}`);
      const response = await route.POST();
      assert.equal(response.status, 410);
      assert.equal((await response.json()).error, 'INTRANET_FEATURE_DISABLED');
    });
  }
}
