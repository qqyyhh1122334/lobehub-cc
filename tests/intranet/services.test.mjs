import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertLocalModelConfiguration,
  createUnavailableClient,
  IntranetFeatureDisabledError,
} from '../../src/server/intranet/services.ts';

test('cloud SDK compatibility object never executes cloud operations', async () => {
  const client = createUnavailableClient('Cloud marketplace');
  assert.throws(
    () => client.skills.callTool({ confidential: 'private' }),
    IntranetFeatureDisabledError,
  );
  assert.throws(() => client.creds.upload('secret'), { code: 'INTRANET_FEATURE_DISABLED' });
  assert.equal(await client, client, 'disabled client must not be treated as a promise');
});

test('local model requires an explicit endpoint and exact administrator allowlist', () => {
  assert.throws(() => assertLocalModelConfiguration('openai', undefined), /explicit internal/);
  assert.throws(
    () => assertLocalModelConfiguration('openai', 'https://api.openai.com/v1', 'model:8000'),
    /not in/,
  );
  assert.throws(
    () => assertLocalModelConfiguration('openai', 'http://model:8001/v1', 'model:8000'),
    /not in/,
  );
  assert.throws(
    () => assertLocalModelConfiguration('openai', 'http://model.evil:8000/v1', 'model:8000'),
    /not in/,
  );
  assert.doesNotThrow(() =>
    assertLocalModelConfiguration('openai', 'http://model:8000/v1', 'model:8000'),
  );
  assert.doesNotThrow(() =>
    assertLocalModelConfiguration('ollama', 'http://ollama:11434', 'ollama:11434'),
  );
});

test('cloud-specific model adapters remain unavailable even with configured keys', () => {
  for (const provider of ['bedrock', 'vertexai', 'github', 'lobehub', 'ollamacloud']) {
    assert.throws(
      () => assertLocalModelConfiguration(provider, 'http://model:8000', 'model:8000'),
      IntranetFeatureDisabledError,
    );
  }
});

test('model endpoint rejects credential and URL protocol smuggling', () => {
  for (const url of [
    'file:///tmp/model',
    'ftp://model:8000',
    'http://u:p@model:8000',
    'http://model:8000/#remote',
    'http://model:8000/?url=https://api.openai.com',
  ]) {
    assert.throws(() => assertLocalModelConfiguration('openai', url, 'model:8000'));
  }
});

test('IPv6 endpoint matching is exact and handles the URL bracket form', () => {
  assert.doesNotThrow(() =>
    assertLocalModelConfiguration('ollama', 'http://[::1]:11434', '[::1]:11434'),
  );
  assert.throws(() => assertLocalModelConfiguration('ollama', 'http://[::1]:11435', '[::1]:11434'));
});
