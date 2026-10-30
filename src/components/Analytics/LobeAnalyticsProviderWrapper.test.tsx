import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LobeAnalyticsProviderWrapper } from './LobeAnalyticsProviderWrapper';
afterEach(cleanup);
it('renders children without loading telemetry even when cloud runtime configuration is present', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  render(
    <LobeAnalyticsProviderWrapper>
      <div>Offline child</div>
    </LobeAnalyticsProviderWrapper>,
  );
  expect(screen.getByText('Offline child')).toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});
