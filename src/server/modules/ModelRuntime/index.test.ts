// @vitest-environment node
import { ModelRuntime } from '@lobechat/model-runtime';
import { ModelProvider } from 'model-bank';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPayloadFromKeyVaults, initModelRuntimeWithUserPayload } from './index';

vi.mock('@/envs/llm', () => ({
  getLLMConfig: () => ({ OPENAI_API_KEY: 'local-test-key' }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('intranet model runtime', () => {
  it('requires an explicitly approved local model endpoint before SDK initialization', () => {
    const initialize = vi
      .spyOn(ModelRuntime, 'initializeWithProvider')
      .mockReturnValue({} as ModelRuntime);
    vi.stubEnv('LOBE_INTRANET_ALLOWED_ENDPOINTS', 'model:8000,ollama:11434');
    expect(() => initModelRuntimeWithUserPayload('openai', {})).toThrow(/explicit internal/);
    expect(() =>
      initModelRuntimeWithUserPayload('openai', { baseURL: 'https://api.openai.com/v1' }),
    ).toThrow(/not in/);
    expect(() =>
      initModelRuntimeWithUserPayload('google', { baseURL: 'http://model:8000' }),
    ).toThrow(/unavailable/);
    expect(initialize).not.toHaveBeenCalled();
    initModelRuntimeWithUserPayload('openai', {
      apiKey: 'local-key',
      baseURL: 'http://model:8000/v1',
    });
    expect(initialize).toHaveBeenCalledWith(
      'openai',
      { apiKey: 'local-key', baseURL: 'http://model:8000/v1' },
      undefined,
    );
  });

  it('uses only the final endpoint after option overrides and supports local custom providers', () => {
    const initialize = vi
      .spyOn(ModelRuntime, 'initializeWithProvider')
      .mockReturnValue({} as ModelRuntime);
    vi.stubEnv('LOBE_INTRANET_ALLOWED_ENDPOINTS', 'model:8000');
    expect(() =>
      initModelRuntimeWithUserPayload(
        'openai',
        { baseURL: 'http://model:8000' },
        { baseURL: 'https://external.example' },
      ),
    ).toThrow(/not in/);
    expect(initialize).not.toHaveBeenCalled();
    initModelRuntimeWithUserPayload('internal-model', {
      baseURL: 'http://model:8000/v1',
      runtimeProvider: 'openai',
    });
    expect(initialize).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({ baseURL: 'http://model:8000/v1' }),
      undefined,
    );
  });

  it('requires explicit configured Ollama endpoint instead of SDK public/default fallbacks', () => {
    const initialize = vi
      .spyOn(ModelRuntime, 'initializeWithProvider')
      .mockReturnValue({} as ModelRuntime);
    vi.stubEnv('LOBE_INTRANET_ALLOWED_ENDPOINTS', 'ollama:11434');
    vi.stubEnv('OLLAMA_PROXY_URL', 'http://ollama:11434');
    initModelRuntimeWithUserPayload('ollama', {});
    expect(initialize).toHaveBeenCalledWith(
      'ollama',
      { baseURL: 'http://ollama:11434' },
      undefined,
    );
  });
});

describe('buildPayloadFromKeyVaults', () => {
  describe('should build payload with correct fields based on runtimeProvider', () => {
    it('OpenAI compatible: returns apiKey, baseURL and runtimeProvider', () => {
      const keyVaults = {
        apiKey: 'test-api-key',
        baseURL: 'https://custom-endpoint.com/v1',
      };
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.OpenAI);

      expect(payload).toEqual({
        apiKey: 'test-api-key',
        baseURL: 'https://custom-endpoint.com/v1',
        runtimeProvider: ModelProvider.OpenAI,
      });
    });

    it('Azure: returns apiKey, baseURL and runtimeProvider', () => {
      const keyVaults = {
        apiKey: 'azure-api-key',
        baseURL: 'https://my-azure.openai.azure.com',
        apiVersion: '2024-06-01',
        endpoint: 'https://fallback-endpoint.com',
      };
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.Azure);

      expect(payload).toEqual({
        apiKey: 'azure-api-key',
        baseURL: 'https://my-azure.openai.azure.com',
        runtimeProvider: ModelProvider.Azure,
      });
    });

    it('Azure: uses endpoint as fallback when baseURL is not provided', () => {
      const keyVaults = {
        apiKey: 'azure-api-key',
        endpoint: 'https://fallback-endpoint.com',
        apiVersion: '2024-06-01',
      };
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.Azure);

      expect(payload.baseURL).toBe('https://fallback-endpoint.com');
    });

    it('Cloudflare: returns apiKey, cloudflareBaseURLOrAccountID and runtimeProvider', () => {
      const keyVaults = {
        apiKey: 'cloudflare-api-key',
        baseURLOrAccountID: 'my-account-id',
      };
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.Cloudflare);

      expect(payload).toEqual({
        apiKey: 'cloudflare-api-key',
        cloudflareBaseURLOrAccountID: 'my-account-id',
        runtimeProvider: ModelProvider.Cloudflare,
      });
    });

    it('Bedrock: returns AWS credentials and runtimeProvider', () => {
      const keyVaults = {
        accessKeyId: 'aws-access-key',
        secretAccessKey: 'aws-secret-key',
        region: 'us-east-1',
        sessionToken: 'session-token',
      };
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.Bedrock);

      expect(payload).toEqual({
        apiKey: 'aws-secret-keyaws-access-key',
        awsAccessKeyId: 'aws-access-key',
        awsRegion: 'us-east-1',
        awsSecretAccessKey: 'aws-secret-key',
        awsSessionToken: 'session-token',
        runtimeProvider: ModelProvider.Bedrock,
      });
    });

    it('Ollama: returns baseURL and runtimeProvider', () => {
      const keyVaults = {
        baseURL: 'http://localhost:11434',
      };
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.Ollama);

      expect(payload).toEqual({
        baseURL: 'http://localhost:11434',
        runtimeProvider: ModelProvider.Ollama,
      });
    });

    it('VertexAI: returns apiKey, baseURL, vertexAIRegion and runtimeProvider', () => {
      const keyVaults = {
        apiKey: 'vertex-credentials-json',
        baseURL: 'https://vertex-endpoint.com',
        region: 'us-central1',
      };
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.VertexAI);

      expect(payload).toEqual({
        apiKey: 'vertex-credentials-json',
        baseURL: 'https://vertex-endpoint.com',
        runtimeProvider: ModelProvider.VertexAI,
        vertexAIRegion: 'us-central1',
      });
    });

    it('ComfyUI: returns all auth fields and runtimeProvider', () => {
      const keyVaults = {
        apiKey: 'comfyui-api-key',
        authType: 'bearer',
        baseURL: 'http://localhost:8188',
        customHeaders: { 'X-Custom': 'header' },
        password: 'pass',
        username: 'user',
      } as const;
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.ComfyUI);

      expect(payload).toEqual({
        apiKey: 'comfyui-api-key',
        authType: 'bearer',
        baseURL: 'http://localhost:8188',
        customHeaders: { 'X-Custom': 'header' },
        password: 'pass',
        runtimeProvider: ModelProvider.ComfyUI,
        username: 'user',
      });
    });

    it('Unknown provider: falls back to default with apiKey, baseURL and runtimeProvider', () => {
      const keyVaults = {
        apiKey: 'unknown-api-key',
        baseURL: 'https://unknown-endpoint.com',
      };
      const payload = buildPayloadFromKeyVaults(keyVaults, 'unknown-provider');

      expect(payload).toEqual({
        apiKey: 'unknown-api-key',
        baseURL: 'https://unknown-endpoint.com',
        runtimeProvider: 'unknown-provider',
      });
    });
  });

  describe('custom provider with sdkType should include provider-specific fields', () => {
    it('custom provider with Azure sdkType keeps apiKey and baseURL only', () => {
      const keyVaults = {
        apiKey: 'custom-azure-key',
        baseURL: 'https://custom-azure.openai.azure.com',
        apiVersion: '2024-06-01',
      };
      // Simulates a custom provider where runtimeProvider is resolved to 'azure'
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.Azure);

      expect(payload.apiKey).toBe('custom-azure-key');
      expect(payload.baseURL).toBe('https://custom-azure.openai.azure.com');
      expect(payload.runtimeProvider).toBe(ModelProvider.Azure);
    });

    it('custom provider with Cloudflare sdkType includes cloudflareBaseURLOrAccountID', () => {
      const keyVaults = {
        apiKey: 'custom-cloudflare-key',
        baseURLOrAccountID: 'custom-account-id',
      };
      // Simulates a custom provider where runtimeProvider is resolved to 'cloudflare'
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.Cloudflare);

      expect(payload.cloudflareBaseURLOrAccountID).toBe('custom-account-id');
      expect(payload.runtimeProvider).toBe(ModelProvider.Cloudflare);
    });

    it('custom provider with Bedrock sdkType includes AWS credentials', () => {
      const keyVaults = {
        accessKeyId: 'custom-aws-id',
        secretAccessKey: 'custom-aws-secret',
        region: 'eu-west-1',
      };
      // Simulates a custom provider where runtimeProvider is resolved to 'bedrock'
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.Bedrock);

      expect(payload.awsAccessKeyId).toBe('custom-aws-id');
      expect(payload.awsSecretAccessKey).toBe('custom-aws-secret');
      expect(payload.awsRegion).toBe('eu-west-1');
      expect(payload.runtimeProvider).toBe(ModelProvider.Bedrock);
    });

    it('custom provider with Ollama sdkType includes baseURL', () => {
      const keyVaults = {
        baseURL: 'http://custom-ollama:11434',
      };
      // Simulates a custom provider where runtimeProvider is resolved to 'ollama'
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.Ollama);

      expect(payload.baseURL).toBe('http://custom-ollama:11434');
      expect(payload.runtimeProvider).toBe(ModelProvider.Ollama);
    });

    it('custom provider with VertexAI sdkType includes vertexAIRegion', () => {
      const keyVaults = {
        apiKey: 'custom-vertex-creds',
        region: 'asia-northeast1',
      };
      // Simulates a custom provider where runtimeProvider is resolved to 'vertexai'
      const payload = buildPayloadFromKeyVaults(keyVaults, ModelProvider.VertexAI);

      expect(payload.vertexAIRegion).toBe('asia-northeast1');
      expect(payload.runtimeProvider).toBe(ModelProvider.VertexAI);
    });
  });
});
