import { describe, expect, it } from 'vitest';

import { normalizeMermaidTheme } from './mermaidTheme';

describe('normalizeMermaidTheme', () => {
  it.each(['default', 'dark', 'lobe-theme', 'neo-dark', 'redux-dark-color'])(
    'preserves the supported %s theme',
    (theme) => expect(normalizeMermaidTheme(theme)).toBe(theme),
  );
  it.each([undefined, null, '', 'unknown-theme', {}, ['dark']])(
    'uses a local default for unsupported imported settings (%j)',
    (theme) => expect(normalizeMermaidTheme(theme)).toBe('lobe-theme'),
  );
});
