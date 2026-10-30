// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock appEnv before importing QueueService
const mockAppEnv = {
  enableQueueAgentRuntime: false,
};

vi.mock('@/envs/app', () => ({
  appEnv: mockAppEnv,
}));

describe('QueueService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    // Reset to default local mode
    mockAppEnv.enableQueueAgentRuntime = false;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Local Execution Mode (default)', () => {
    it('should return LocalQueueServiceImpl when enableQueueAgentRuntime is false', async () => {
      const { createQueueServiceModule, LocalQueueServiceImpl } = await import('../impls');
      const impl = createQueueServiceModule();
      expect(impl).toBeInstanceOf(LocalQueueServiceImpl);
    });

    it('should return true for isLocalExecution when in local mode', async () => {
      const { QueueService } = await import('../QueueService');
      const service = new QueueService();
      expect(service.isLocalExecution()).toBe(true);
    });

    it('should schedule message and return task ID in local mode', async () => {
      const { QueueService } = await import('../QueueService');
      const service = new QueueService();

      const taskId = await service.scheduleMessage({
        context: { phase: 'user_input' } as any,
        endpoint: 'http://test.com',
        operationId: 'test-op',
        priority: 'normal',
        stepIndex: 0,
      });

      expect(taskId).toMatch(/^local-test-op-0-\d+-\d+$/);
    });

    it('should schedule batch messages in local mode', async () => {
      const { QueueService } = await import('../QueueService');
      const service = new QueueService();

      const taskIds = await service.scheduleBatchMessages([
        {
          context: { phase: 'user_input' } as any,
          endpoint: 'http://test.com',
          operationId: 'test-op-1',
          priority: 'normal',
          stepIndex: 0,
        },
        {
          context: { phase: 'user_input' } as any,
          endpoint: 'http://test.com',
          operationId: 'test-op-2',
          priority: 'normal',
          stepIndex: 0,
        },
      ]);

      expect(taskIds).toHaveLength(2);
      expect(taskIds[0]).toMatch(/^local-test-op-1-0-\d+-\d+$/);
      expect(taskIds[1]).toMatch(/^local-test-op-2-0-\d+-\d+$/);
    });

    it('should accept cancellation of an unknown local task', async () => {
      const { QueueService } = await import('../QueueService');
      const service = new QueueService();

      // Cancelling an unknown or already completed task is idempotent.
      await expect(service.cancelScheduledTask('task-123')).resolves.toBeUndefined();
    });

    it('should return queue stats in local mode', async () => {
      const { QueueService } = await import('../QueueService');
      const service = new QueueService();

      const stats = await service.getQueueStats();
      expect(stats).toEqual({
        completedCount: 0,
        failedCount: 0,
        pendingCount: 0,
        processingCount: 0,
      });
    });

    it('should report unready until an execution callback is registered', async () => {
      const { QueueService } = await import('../QueueService');
      const service = new QueueService();

      const result = await service.healthCheck();
      expect(result).toEqual({
        healthy: false,
        message: 'Local queue execution callback is not registered',
      });
    });
  });

  describe('Legacy cloud configuration cannot enable QStash', () => {
    it('always creates an in-process queue even if a legacy token is present', async () => {
      mockAppEnv.enableQueueAgentRuntime = true;
      vi.stubEnv('QSTASH_TOKEN', 'legacy-key');
      vi.stubEnv('AGENT_RUNTIME_MODE', 'queue');
      try {
        const { createQueueServiceModule, LocalQueueServiceImpl, isQueueAgentRuntimeEnabled } =
          await import('../impls');
        expect(createQueueServiceModule()).toBeInstanceOf(LocalQueueServiceImpl);
        expect(isQueueAgentRuntimeEnabled()).toBe(false);
        const { QueueService } = await import('../QueueService');
        expect(new QueueService().isLocalExecution()).toBe(true);
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe('calculateDelay', () => {
    it('should return base delay for high priority', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: false,
        hasToolCalls: false,
        priority: 'high',
        stepIndex: 0,
      });
      expect(delay).toBe(200);
    });

    it('should return base delay for normal priority', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: false,
        hasToolCalls: false,
        priority: 'normal',
        stepIndex: 0,
      });
      expect(delay).toBe(1000);
    });

    it('should return base delay for low priority', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: false,
        hasToolCalls: false,
        priority: 'low',
        stepIndex: 0,
      });
      expect(delay).toBe(5000);
    });

    it('should add delay for tool calls', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: false,
        hasToolCalls: true,
        priority: 'normal',
        stepIndex: 0,
      });
      expect(delay).toBe(2000); // 1000 base + 1000 for tool calls
    });

    it('should add exponential backoff for errors', async () => {
      const { QueueService } = await import('../QueueService');

      const delay1 = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: false,
        priority: 'normal',
        stepIndex: 1,
      });
      expect(delay1).toBe(2000); // 1000 base + 1000 * 1

      const delay5 = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: false,
        priority: 'normal',
        stepIndex: 5,
      });
      expect(delay5).toBe(6000); // 1000 base + 1000 * 5

      const delay15 = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: false,
        priority: 'normal',
        stepIndex: 15,
      });
      expect(delay15).toBe(11000); // 1000 base + 10000 (max)
    });

    it('should combine tool calls and error delays', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: true,
        priority: 'high',
        stepIndex: 2,
      });
      expect(delay).toBe(3200); // 200 base + 1000 for tools + 2000 for errors
    });

    it('should handle high priority with tool calls only', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: false,
        hasToolCalls: true,
        priority: 'high',
        stepIndex: 0,
      });
      expect(delay).toBe(1200); // 200 base + 1000 for tool calls
    });

    it('should handle low priority with tool calls only', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: false,
        hasToolCalls: true,
        priority: 'low',
        stepIndex: 0,
      });
      expect(delay).toBe(6000); // 5000 base + 1000 for tool calls
    });

    it('should handle high priority with errors at stepIndex 0', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: false,
        priority: 'high',
        stepIndex: 0,
      });
      expect(delay).toBe(200); // 200 base + 0 for errors (0 * 1000)
    });

    it('should handle low priority with errors at various stepIndex', async () => {
      const { QueueService } = await import('../QueueService');

      const delay1 = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: false,
        priority: 'low',
        stepIndex: 1,
      });
      expect(delay1).toBe(6000); // 5000 base + 1000

      const delay3 = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: false,
        priority: 'low',
        stepIndex: 3,
      });
      expect(delay3).toBe(8000); // 5000 base + 3000

      const delay12 = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: false,
        priority: 'low',
        stepIndex: 12,
      });
      expect(delay12).toBe(15000); // 5000 base + 10000 (max)
    });

    it('should handle all flags combined - normal priority', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: true,
        priority: 'normal',
        stepIndex: 3,
      });
      expect(delay).toBe(5000); // 1000 base + 1000 for tools + 3000 for errors
    });

    it('should handle all flags combined - low priority', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: true,
        priority: 'low',
        stepIndex: 4,
      });
      expect(delay).toBe(10000); // 5000 base + 1000 for tools + 4000 for errors
    });

    it('should cap exponential backoff at 10 seconds for stepIndex 10', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: false,
        priority: 'normal',
        stepIndex: 10,
      });
      expect(delay).toBe(11000); // 1000 base + 10000 (max, not 10000)
    });

    it('should cap exponential backoff at 10 seconds for stepIndex 11', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: false,
        priority: 'normal',
        stepIndex: 11,
      });
      expect(delay).toBe(11000); // 1000 base + 10000 (max, not 11000)
    });

    it('should cap exponential backoff at 10 seconds for stepIndex 100', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: false,
        priority: 'normal',
        stepIndex: 100,
      });
      expect(delay).toBe(11000); // 1000 base + 10000 (max, not 100000)
    });

    it('should handle maximum delay scenario - low priority with all flags and high stepIndex', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: true,
        priority: 'low',
        stepIndex: 50,
      });
      expect(delay).toBe(16000); // 5000 base + 1000 for tools + 10000 (max for errors)
    });

    it('should handle minimum delay scenario - high priority with no flags', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: false,
        hasToolCalls: false,
        priority: 'high',
        stepIndex: 100, // stepIndex doesn't matter without errors
      });
      expect(delay).toBe(200); // 200 base only
    });

    it('should handle errors at exact boundary stepIndex 10', async () => {
      const { QueueService } = await import('../QueueService');
      const delay = QueueService.calculateDelay({
        hasErrors: true,
        hasToolCalls: true,
        priority: 'high',
        stepIndex: 10,
      });
      expect(delay).toBe(11200); // 200 base + 1000 for tools + 10000 (exactly at max)
    });
  });
});
