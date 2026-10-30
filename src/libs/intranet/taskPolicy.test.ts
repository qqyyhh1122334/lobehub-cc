// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assertTaskAutomationAvailable } from './taskPolicy';

describe('intranet task automation', () => {
  it.each([
    {},
    { automationMode: null },
    { automationMode: 'heartbeat' },
    { automationMode: null, schedulePattern: null },
  ])('preserves manual/heartbeat tasks and clearing old cron settings: %j', (input) => {
    expect(() => assertTaskAutomationAvailable(input)).not.toThrow();
  });
  it.each([
    { automationMode: 'schedule' },
    { schedulePattern: '* * * * *' },
    { automationMode: 'heartbeat', schedulePattern: '* * * * *' },
  ])('rejects cron tasks before persistence or execution: %j', (input) => {
    expect(() => assertTaskAutomationAvailable(input)).toThrow(
      'INTRANET_FEATURE_DISABLED: cron schedules',
    );
  });
});
