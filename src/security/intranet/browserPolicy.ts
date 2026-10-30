/** Immutable browser policy. All internal services must be reached through the app origin. */
export const INTRANET_CSP =
  [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self' blob: data:",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "child-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "manifest-src 'self'",
  ].join('; ') + ';';
