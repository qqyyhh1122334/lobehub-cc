// @vitest-environment node
import { expect, it } from 'vitest';
import { POST } from '../route';

it('rejects the retired benchmark ingestion webhook before processing user data', async () => {
  const response = POST();
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({ error: 'INTRANET_FEATURE_DISABLED' });
});
