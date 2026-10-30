import { type MermaidProps } from '@lobehub/ui';

/** Persisted/imported settings may contain themes unsupported by the pinned UI. */
export const normalizeMermaidTheme = (theme: unknown): MermaidProps['theme'] => {
  switch (theme) {
    case 'base':
    case 'dark':
    case 'default':
    case 'forest':
    case 'lobe-theme':
    case 'neo':
    case 'neo-dark':
    case 'neutral':
    case 'null':
    case 'redux':
    case 'redux-color':
    case 'redux-dark':
    case 'redux-dark-color':
      return theme;
    default:
      return 'lobe-theme';
  }
};
