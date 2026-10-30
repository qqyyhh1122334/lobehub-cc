import { TRPCError } from '@trpc/server';

export interface TaskAutomationInput {
  automationMode?: string | null;
  schedulePattern?: string | null;
}

/** Cron dispatch belonged to the removed cloud workflow service. */
export const isCronTask = (input: TaskAutomationInput): boolean =>
  input.automationMode === 'schedule' || !!input.schedulePattern;

export function assertTaskAutomationAvailable(input: TaskAutomationInput): void {
  if (isCronTask(input)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'INTRANET_FEATURE_DISABLED: cron schedules require a durable local scheduler',
    });
  }
}
