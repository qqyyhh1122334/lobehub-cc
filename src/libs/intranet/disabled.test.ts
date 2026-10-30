// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { disabledCloudRoute } from './disabled';

describe('retired cloud workflow routes', () => {
  it('returns an explicit 410 instead of accepting a job', async () => {
    const response = disabledCloudRoute();
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: 'INTRANET_FEATURE_DISABLED' });
  });
});
