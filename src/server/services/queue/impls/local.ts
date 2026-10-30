import debug from 'debug';

import type { HealthCheckResult, QueueMessage, QueueStats } from '../types';
import type { QueueServiceImpl } from './type';

const log = debug('queue:local');

const validateDelay = (delay: number): void => {
  if (!Number.isFinite(delay) || delay < 0 || delay > 2_147_483_647) {
    throw new RangeError('Local queue delay must be between 0 and 2147483647 milliseconds');
  }
};

export type LocalExecutionCallback = (
  operationId: string,
  stepIndex: number,
  context: any,
) => Promise<void>;

/** In-process execution only. Timers and counters do not survive a process restart. */
export class LocalQueueServiceImpl implements QueueServiceImpl {
  private executionCallback: LocalExecutionCallback | null = null;
  private pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private processing = new Set<string>();
  private completedCount = 0;
  private failedCount = 0;
  private sequence = 0;

  setExecutionCallback(callback: LocalExecutionCallback): void {
    this.executionCallback = callback;
  }

  async scheduleMessage(message: QueueMessage): Promise<string> {
    const { operationId, stepIndex, context, delay = 50 } = message;
    validateDelay(delay);
    const taskId = `local-${operationId}-${stepIndex}-${Date.now()}-${this.sequence++}`;
    const timer = setTimeout(async () => {
      this.pendingTimers.delete(taskId);
      if (!this.executionCallback) {
        this.failedCount += 1;
        log('Local task %s failed: no execution callback is registered', taskId);
        return;
      }
      this.processing.add(taskId);
      try {
        await this.executionCallback(operationId, stepIndex, context);
        this.completedCount += 1;
      } catch (error) {
        this.failedCount += 1;
        log('Local task %s failed: %O', taskId, error);
      } finally {
        this.processing.delete(taskId);
      }
    }, delay);
    this.pendingTimers.set(taskId, timer);
    return taskId;
  }

  async scheduleBatchMessages(messages: QueueMessage[]): Promise<string[]> {
    // Validate the entire batch before scheduling any timer.
    for (const message of messages) validateDelay(message.delay ?? 50);
    return Promise.all(messages.map((message) => this.scheduleMessage(message)));
  }

  async cancelScheduledTask(taskId: string): Promise<void> {
    const timer = this.pendingTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.pendingTimers.delete(taskId);
    }
    // A running callback must be stopped by AgentRuntime's operation interruption mechanism.
  }

  async getQueueStats(): Promise<QueueStats> {
    return {
      completedCount: this.completedCount,
      failedCount: this.failedCount,
      pendingCount: this.pendingTimers.size,
      processingCount: this.processing.size,
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      healthy: this.executionCallback !== null,
      message: this.executionCallback
        ? `Local queue service healthy, ${this.pendingTimers.size} pending executions`
        : 'Local queue execution callback is not registered',
    };
  }
}
