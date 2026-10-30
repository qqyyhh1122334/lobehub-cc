import { LocalTaskScheduler, type TaskExecutionCallback } from './local';
import type { TaskSchedulerImpl } from './type';

let cachedScheduler: TaskSchedulerImpl | null = null;
let cachedExecutionCallback: TaskExecutionCallback | null = null;

/**
 * Get (or lazily create) the singleton task scheduler.
 *
 * Uses the in-process scheduler. Pending timers do not survive a process restart.
 *
 * Singleton because `LocalTaskScheduler` holds in-memory `setTimeout` state and
 * a per-request instance would orphan pending timers on the next request.
 */
export const createTaskSchedulerModule = (): TaskSchedulerImpl => {
  if (cachedScheduler) return cachedScheduler;

  const local = new LocalTaskScheduler();
  if (cachedExecutionCallback) local.setExecutionCallback(cachedExecutionCallback);
  cachedScheduler = local;

  // Lazy-load the heartbeat tick runner so it registers its own callback via
  // `setTaskSchedulerExecutionCallback`. Dynamic import avoids the import
  // cycle (heartbeatTick → TaskRunnerService → TaskLifecycleService →
  // createTaskSchedulerModule). Heartbeat ticks always fire after `delay`
  // seconds, so the dynamic import resolves long before the first tick.
  if (!cachedExecutionCallback) {
    void import('@/server/services/taskRunner/heartbeatTick').catch((e) => {
      console.warn('[taskScheduler] failed to load heartbeat tick runner:', e);
    });
  }

  return cachedScheduler;
};

/**
 * Register the in-process callback the LocalTaskScheduler invokes on tick.
 * Calling this after a Local scheduler is already created retroactively
 * wires the callback in.
 */
export const setTaskSchedulerExecutionCallback = (callback: TaskExecutionCallback): void => {
  cachedExecutionCallback = callback;
  if (cachedScheduler instanceof LocalTaskScheduler) {
    cachedScheduler.setExecutionCallback(callback);
  }
};

export { LocalTaskScheduler } from './local';
export type { TaskSchedulerImpl } from './type';
