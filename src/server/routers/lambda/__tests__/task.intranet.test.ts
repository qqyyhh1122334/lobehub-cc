// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const models = vi.hoisted(() => ({
  resolve: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(() => models),
}));
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn(async () => ({})) }));
vi.mock('@/database/models/agent', () => ({ AgentModel: vi.fn(() => ({})) }));
vi.mock('@/database/models/brief', () => ({ BriefModel: vi.fn(() => ({})) }));
vi.mock('@/database/models/taskTopic', () => ({ TaskTopicModel: vi.fn(() => ({})) }));
vi.mock('@/server/services/task', () => ({ TaskService: vi.fn(() => ({})) }));
vi.mock('@/server/services/taskRunner', () => ({ TaskRunnerService: vi.fn(() => ({})) }));

import { taskRouter } from '../task';

const caller = () => taskRouter.createCaller({ userId: 'user-1' });

describe('intranet task updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    models.resolve.mockResolvedValue({
      id: 'task-1',
      automationMode: 'schedule',
      schedulePattern: '* * * * *',
    });
    models.update.mockImplementation(async (id, data) => ({ id, ...data }));
  });

  it.each(['heartbeat', null] as const)(
    'converts an old cron task to %s and clears its cron fields',
    async (automationMode) => {
      await caller().update({ id: 'task-1', automationMode });
      expect(models.update).toHaveBeenCalledWith('task-1', {
        automationMode,
        schedulePattern: null,
        scheduleTimezone: null,
      });
    },
  );

  it.each([{ automationMode: 'schedule' as const }, { schedulePattern: '0 9 * * *' }])(
    'rejects enabling cron before updating a record',
    async (input) => {
      await expect(caller().update({ id: 'task-1', ...input })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(models.resolve).not.toHaveBeenCalled();
      expect(models.update).not.toHaveBeenCalled();
    },
  );

  it('allows historical task metadata to be edited without deleting its record', async () => {
    await caller().update({ id: 'task-1', name: 'Historical task' });
    expect(models.update).toHaveBeenCalledWith('task-1', { name: 'Historical task' });
  });
});
