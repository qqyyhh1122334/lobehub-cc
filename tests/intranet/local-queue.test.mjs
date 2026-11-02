/** Dependency-free tests of actual queue/scheduler modules. Only the debug logger is replaced. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'debug')
      return { url: 'data:text/javascript,export default () => () => {};', shortCircuit: true };
    return next(specifier, context);
  },
});
const { LocalQueueServiceImpl } = await import('../../src/server/services/queue/impls/local.ts');
const { LocalTaskScheduler } =
  await import('../../src/server/services/taskScheduler/impls/local.ts');
const message = {
  delay: 10,
  endpoint: 'https://never-contact.invalid',
  operationId: 'same',
  stepIndex: 0,
};

await test('local queue cancellation prevents execution and records waiting/completed work', async () => {
  const queue = new LocalQueueServiceImpl();
  const executed = [];
  queue.setExecutionCallback(async (...args) => {
    executed.push(args);
  });
  const first = await queue.scheduleMessage(message);
  const second = await queue.scheduleMessage(message);
  assert.notEqual(first, second);
  assert.equal((await queue.getQueueStats()).pendingCount, 2);
  await queue.cancelScheduledTask(first);
  assert.equal((await queue.getQueueStats()).pendingCount, 1);
  await wait(30);
  assert.equal(executed.length, 1);
  assert.deepEqual(await queue.getQueueStats(), {
    completedCount: 1,
    failedCount: 0,
    pendingCount: 0,
    processingCount: 0,
  });
});
await test('local queue reports missing callback as unready and failed execution', async () => {
  const queue = new LocalQueueServiceImpl();
  assert.equal((await queue.healthCheck()).healthy, false);
  await queue.scheduleMessage(message);
  await wait(30);
  assert.equal((await queue.getQueueStats()).failedCount, 1);
});
await test('local queue distinguishes in-flight work from completed/failed work', async () => {
  const queue = new LocalQueueServiceImpl();
  let complete;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  queue.setExecutionCallback(async () => {
    await pending;
    throw new Error('local failure');
  });
  await queue.scheduleMessage(message);
  await wait(30);
  assert.equal((await queue.getQueueStats()).processingCount, 1);
  complete();
  await wait(0);
  assert.deepEqual(await queue.getQueueStats(), {
    completedCount: 0,
    failedCount: 1,
    pendingCount: 0,
    processingCount: 0,
  });
});
await test('local scheduler cancellation isolates repeated schedules', async () => {
  const scheduler = new LocalTaskScheduler();
  let executions = 0;
  scheduler.setExecutionCallback(async () => {
    executions += 1;
  });
  const first = await scheduler.scheduleNextTopic({ taskId: 'same', userId: 'u', delay: 0.01 });
  const second = await scheduler.scheduleNextTopic({ taskId: 'same', userId: 'u', delay: 0.01 });
  assert.notEqual(first, second);
  await scheduler.cancelScheduled(first);
  await wait(30);
  assert.equal(executions, 1);
});
await test('unsafe timers fail instead of overflowing into immediate execution', async () => {
  for (const delay of [-1, NaN, Infinity, 2_147_483_648]) {
    await assert.rejects(
      new LocalQueueServiceImpl().scheduleMessage({ ...message, delay }),
      RangeError,
    );
  }
  for (const delay of [-1, NaN, Infinity, 2_147_484]) {
    await assert.rejects(
      new LocalTaskScheduler().scheduleNextTopic({ taskId: 't', userId: 'u', delay }),
      RangeError,
    );
  }
});

await test('invalid batches do not leave partially scheduled work', async () => {
  const queue = new LocalQueueServiceImpl();
  await assert.rejects(
    queue.scheduleBatchMessages([message, { ...message, delay: -1 }]),
    RangeError,
  );
  assert.equal((await queue.getQueueStats()).pendingCount, 0);
});
