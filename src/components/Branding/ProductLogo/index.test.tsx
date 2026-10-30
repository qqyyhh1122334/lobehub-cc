import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProductLogo } from './index';

afterEach(cleanup);

describe('intranet product branding', () => {
  it.each([undefined, '3d', 'flat', 'mono', 'text', 'combine'] as const)(
    'renders the %s brand without downloading an image',
    (type) => {
      const { container } = render(<ProductLogo size={40} type={type} />);
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('svg')).not.toBeNull();
      expect(container.querySelector('[href^="http"], [src^="http"]')).toBeNull();
    },
  );
});
