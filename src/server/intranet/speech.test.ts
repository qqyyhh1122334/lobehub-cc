// @vitest-environment node
import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createOpenai } from '@/app/(backend)/_deprecated/createBizOpenAI/createOpenai';
import { POST as edgeSpeech } from '@/app/(backend)/webapi/tts/edge/route';
import { POST as microsoftSpeech } from '@/app/(backend)/webapi/tts/microsoft/route';

vi.mock('openai', () => ({ default: vi.fn() }));
vi.mock('@/envs/llm', () => ({ getLLMConfig: () => ({ OPENAI_API_KEY: 'local-key' }) }));

describe('intranet speech services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('LOBE_INTRANET_ALLOWED_ENDPOINTS', 'speech.internal:8000');
    vi.stubEnv('OPENAI_PROXY_URL', 'http://speech.internal:8000/v1');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('constructs the speech client only with an explicitly approved internal endpoint', () => {
    createOpenai(null);
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'local-key',
      baseURL: 'http://speech.internal:8000/v1',
    });
  });

  it('rejects missing configuration before the SDK can use its public default', () => {
    vi.stubEnv('OPENAI_PROXY_URL', '');
    expect(() => createOpenai(null)).toThrow('explicit internal baseURL');
    expect(OpenAI).not.toHaveBeenCalled();
  });

  it.each(['https://api.openai.com/v1', 'http://speech.internal:9000/v1'])(
    'rejects an unapproved request-header endpoint: %s',
    (endpoint) => {
      expect(() => createOpenai('user-key', endpoint)).toThrow('not in');
      expect(OpenAI).not.toHaveBeenCalled();
    },
  );

  it.each([edgeSpeech, microsoftSpeech])('returns 410 for cloud-only speech', async (handler) => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      const response = await handler();
      expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({
        error: { code: 'INTRANET_FEATURE_DISABLED' },
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(OpenAI).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
