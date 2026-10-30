import { beforeEach, describe, expect, it, vi } from 'vitest';

import { userMemoryRouter } from '@/server/routers/lambda/userMemory';
import { AsyncTaskErrorType, AsyncTaskStatus } from '@/types/asyncTask';

const mockFindActiveByType = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindById = vi.fn();

const mockCountTopicsForMemoryExtractor = vi.fn();
const mockDeleteAll = vi.fn();
const { mockTriggerProcessUsers } = vi.hoisted(() => ({
  mockTriggerProcessUsers: vi.fn(),
}));

vi.mock('@/database/models/asyncTask', () => ({
  AsyncTaskModel: vi.fn(() => ({
    create: mockCreate,
    findById: mockFindById,
    findActiveByType: mockFindActiveByType,
    update: mockUpdate,
  })),
  initUserMemoryExtractionMetadata: vi.fn((metadata) => metadata),
}));

vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn(() => ({
    countTopicsForMemoryExtractor: mockCountTopicsForMemoryExtractor,
  })),
}));

vi.mock('@/database/models/userMemory', () => ({
  UserMemoryActivityModel: vi.fn(() => ({})),
  UserMemoryContextModel: vi.fn(() => ({})),
  UserMemoryExperienceModel: vi.fn(() => ({})),
  UserMemoryIdentityModel: vi.fn(() => ({})),
  UserMemoryModel: vi.fn(() => ({
    deleteAll: mockDeleteAll,
  })),
  UserMemoryPreferenceModel: vi.fn(() => ({})),
}));

vi.mock('@/envs/app', () => ({
  appEnv: {
    APP_URL: 'https://example.com',
    INTERNAL_APP_URL: 'https://internal.example.com',
  },
}));

vi.mock('@/server/globalConfig/parseMemoryExtractionConfig', () => ({
  parseMemoryExtractionConfig: vi.fn(() => ({
    webhook: { baseUrl: 'https://internal.example.com' },
    upstashWorkflowExtraHeaders: { 'x-test': 'ok' },
  })),
}));

vi.mock('@/server/services/memory/userMemory/extract', () => ({
  MemoryExtractionWorkflowService: {
    triggerProcessUsers: mockTriggerProcessUsers,
  },
  buildWorkflowPayloadInput: (payload: any) => payload,
  normalizeMemoryExtractionPayload: (payload: any) => payload,
}));

const createCaller = (ctxOverrides: Partial<any> = {}) => {
  const ctx = {
    serverDB: {} as any,
    userId: 'user-1',
    ...ctxOverrides,
  };

  return userMemoryRouter.createCaller(ctx);
};

describe('userMemoryRouter.requestMemoryFromChatTopic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects removed cloud extraction before creating or scheduling a job', async () => {
    const caller = createCaller();
    await expect(caller.requestMemoryFromChatTopic({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'INTRANET_FEATURE_DISABLED: cloud memory extraction',
    });
    expect(mockFindActiveByType).not.toHaveBeenCalled();
    expect(mockCountTopicsForMemoryExtractor).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockTriggerProcessUsers).not.toHaveBeenCalled();
  });
});

describe('userMemoryRouter.getMemoryExtractionTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns null when no active task', async () => {
    mockFindActiveByType.mockResolvedValue(undefined);

    const caller = createCaller();
    const result = await caller.getMemoryExtractionTask();

    expect(result).toBeNull();
  });

  it('returns active task with normalized metadata', async () => {
    mockFindActiveByType.mockResolvedValue({
      id: 'task-1',
      metadata: {
        progress: { completedTopics: 1, totalTopics: 4 },
        source: 'chat_topic',
      },
      status: AsyncTaskStatus.Processing,
      userId: 'user-1',
    });

    const caller = createCaller();
    const result = await caller.getMemoryExtractionTask();

    expect(result).toEqual({
      error: undefined,
      id: 'task-1',
      metadata: {
        progress: { completedTopics: 1, totalTopics: 4 },
        range: undefined,
        source: 'chat_topic',
      },
      status: AsyncTaskStatus.Processing,
    });
  });

  it('fetches by task id when provided', async () => {
    mockFindActiveByType.mockResolvedValue(undefined);
    mockFindById.mockResolvedValue({
      id: 'a0a0a0a0-a0a0-4a0a-a0a0-a0a0a0a0a0a0',
      metadata: {
        progress: { completedTopics: 2, totalTopics: 8 },
        source: 'chat_topic',
      },
      status: AsyncTaskStatus.Pending,
      userId: 'user-1',
    });

    const caller = createCaller();
    const result = await caller.getMemoryExtractionTask({
      taskId: 'a0a0a0a0-a0a0-4a0a-a0a0-a0a0a0a0a0a0',
    });

    expect(mockFindById).toHaveBeenCalledWith('a0a0a0a0-a0a0-4a0a-a0a0-a0a0a0a0a0a0');
    expect(result?.id).toBe('a0a0a0a0-a0a0-4a0a-a0a0-a0a0a0a0a0a0');
  });

  it('marks active task as error when topic-based timeout is exceeded', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-01T01:00:00.000Z'));

    mockFindActiveByType.mockResolvedValue({
      createdAt: new Date('2024-03-01T00:00:00.000Z'),
      id: 'task-timeout',
      metadata: {
        progress: { completedTopics: 1, totalTopics: 6 },
        source: 'chat_topic',
      },
      status: AsyncTaskStatus.Processing,
      userId: 'user-1',
    });

    const caller = createCaller();
    const result = await caller.getMemoryExtractionTask();

    expect(mockUpdate).toHaveBeenCalledWith(
      'task-timeout',
      expect.objectContaining({
        error: expect.objectContaining({
          body: expect.objectContaining({
            detail: expect.stringContaining('timed out after 30 minutes'),
          }),
          name: AsyncTaskErrorType.Timeout,
        }),
        status: AsyncTaskStatus.Error,
      }),
    );
    expect(result).toEqual({
      error: expect.objectContaining({
        body: expect.objectContaining({
          detail: expect.stringContaining('timed out after 30 minutes'),
        }),
        name: AsyncTaskErrorType.Timeout,
      }),
      id: 'task-timeout',
      metadata: {
        progress: { completedTopics: 1, totalTopics: 6 },
        range: undefined,
        source: 'chat_topic',
      },
      status: AsyncTaskStatus.Error,
    });
  });
});

describe('userMemoryRouter.deleteAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('purges all user memories through the aggregate model', async () => {
    mockDeleteAll.mockResolvedValue(undefined);

    const caller = createCaller();
    const result = await caller.deleteAll();

    expect(mockDeleteAll).toHaveBeenCalledOnce();
    expect(result).toEqual({ success: true });
  });
});
