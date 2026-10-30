// @vitest-environment node
import { MessageToolIdentifier } from '@lobechat/builtin-tool-message';
import { describe, expect, it, vi } from 'vitest';

import type { ToolExecutionContext } from '../../types';
import { messageRuntime } from '../message';

describe('retired cloud message runtime', () => {
  it('retains its tool identifier for explicit unavailable errors', () => {
    expect(messageRuntime.identifier).toBe(MessageToolIdentifier);
  });

  it('rejects before reading credentials, database, or any runtime context', async () => {
    const context = new Proxy({} as ToolExecutionContext, {
      get() {
        throw new Error('Cloud message runtime must not inspect context');
      },
    });
    const network = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(messageRuntime.factory(context)).rejects.toMatchObject({
        code: 'INTRANET_FEATURE_DISABLED',
      });
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
});
