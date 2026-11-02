import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from '../../src/app/(backend)/webapi/models/[provider]/pull/route.ts';

test('the model download route rejects before constructing a runtime or contacting a registry', async () => {
  const response = POST();
  assert.equal(response.status, 410);
  const body = await response.json();
  assert.equal(body.error, 'INTRANET_FEATURE_DISABLED');
  assert.match(body.message, /administrator to import an approved model/);
});
