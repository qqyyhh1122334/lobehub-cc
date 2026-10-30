// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalQueueServiceImpl } from './local';

const message = {
  endpoint: 'https://must-not-be-used.invalid',
  operationId: 'same',
  stepIndex: 1,
  delay: 10,
};

describe('intranet local queue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('cancels one pending timer without losing another scheduled in the same millisecond', async () => {
    const queue = new LocalQueueServiceImpl();
    const execute = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    queue.setExecutionCallback(execute);
    const first = await queue.scheduleMessage(message);
    const second = await queue.scheduleMessage(message);
    expect(first).not.toBe(second);
    expect((await queue.getQueueStats()).pendingCount).toBe(2);
    await queue.cancelScheduledTask(first);
    expect((await queue.getQueueStats()).pendingCount).toBe(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(execute).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await queue.getQueueStats()).toEqual({
      pendingCount: 0,
      processingCount: 0,
      completedCount: 1,
      failedCount: 0,
    });
  });

  it('records callback errors instead of reporting successful completion', async () => {
    const queue = new LocalQueueServiceImpl();
    queue.setExecutionCallback(vi.fn().mockRejectedValue(new Error('failed')));
    await queue.scheduleMessage(message);
    await vi.advanceTimersByTimeAsync(10);
    expect((await queue.getQueueStats()).failedCount).toBe(1);
  });

  it('reports missing callback as unready and records dropped execution as failed', async () => {
    const queue = new LocalQueueServiceImpl();
    expect((await queue.healthCheck()).healthy).toBe(false);
    await queue.scheduleMessage(message);
    await vi.advanceTimersByTimeAsync(10);
    expect((await queue.getQueueStats()).failedCount).toBe(1);
  });

  it('does not partially schedule an invalid batch', async () => {
    const queue = new LocalQueueServiceImpl();
    await expect(queue.scheduleBatchMessages([message, { ...message, delay: -1 }])).rejects.toThrow(
      RangeError,
    );
    expect((await queue.getQueueStats()).pendingCount).toBe(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'rejects unsafe delay %s',
    async (delay) => {
      await expect(
        new LocalQueueServiceImpl().scheduleMessage({ ...message, delay }),
      ).rejects.toThrow(RangeError);
    },
  );
});
