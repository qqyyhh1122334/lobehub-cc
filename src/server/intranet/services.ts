/** Local service policy, independent of application imports so it can be tested without a build. */
export class IntranetFeatureDisabledError extends Error {
  code = 'INTRANET_FEATURE_DISABLED';

  constructor(feature: string) {
    super(`${feature} is unavailable in the intranet edition`);
    this.name = 'IntranetFeatureDisabledError';
  }
}

export function unavailable(feature: string): never {
  throw new IntranetFeatureDisabledError(feature);
}

/** Preserve legacy SDK-shaped call sites without constructing or importing a cloud SDK. */
export function createUnavailableClient<T>(feature: string): T {
  const client: (...args: unknown[]) => never = new Proxy(() => unavailable(feature), {
    apply: () => unavailable(feature),
    get: (_target, property) => (property === 'then' ? undefined : client),
  });
  return client as unknown as T;
}

const localAdapters = new Set(['openai', 'ollama', 'vllm', 'lmstudio', 'xinference', 'comfyui']);

/**
 * No SDK is allowed to fall back to its public default endpoint. DNS/IP validation
 * and redirect enforcement are performed again by the mandatory network preload.
 */
export function assertLocalModelConfiguration(
  provider: string,
  baseURL: unknown,
  allowedEndpoints = process.env.LOBE_INTRANET_ALLOWED_ENDPOINTS || '',
): void {
  if (!localAdapters.has(provider)) unavailable(`Model adapter ${provider}`);
  if (typeof baseURL !== 'string' || !baseURL) {
    throw new Error(`An explicit internal baseURL is required for ${provider}`);
  }
  const url = new URL(baseURL);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  ) {
    throw new Error(
      'Model endpoint must be an HTTP(S) URL without credentials, query, or fragment',
    );
  }
  const endpoint = `${url.hostname.toLowerCase()}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
  const allowed = allowedEndpoints.split(',').map((entry) => entry.trim().toLowerCase());
  if (!allowed.includes(endpoint)) {
    throw new Error('Model endpoint is not in LOBE_INTRANET_ALLOWED_ENDPOINTS');
  }
}
