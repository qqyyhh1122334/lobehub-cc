const DEFAULT_DEV_BACKEND_URL = 'https://app.lobehub.com';

/** The page stays on the backend origin so authentication and API requests stay same-origin. */
export function resolveDevBackendUrl(value = DEFAULT_DEV_BACKEND_URL): string {
  const url = new URL(value);

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'DEV_BACKEND_URL must be an HTTP(S) origin without credentials, a path, query or hash',
    );
  }

  return url.origin;
}

export function createDebugProxyUrl(backendUrl: string, localUrl: string): string {
  const url = new URL('/_dangerous_local_dev_proxy', backendUrl);
  url.searchParams.set('debug-host', new URL(localUrl).origin);
  return url.toString();
}
