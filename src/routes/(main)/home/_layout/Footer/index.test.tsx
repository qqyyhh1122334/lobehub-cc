import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Footer from './index';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => (key === 'userPanel.setting' ? 'Settings' : key) }),
}));
vi.mock('@/features/User/UserPanel/ThemeButton', () => ({
  default: () => <button type="button">Theme</button>,
}));

afterEach(cleanup);
const renderFooter = () =>
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<Footer />} path="/" />
        <Route element={<div>Local settings page</div>} path="/settings" />
      </Routes>
    </MemoryRouter>,
  );

describe('intranet footer', () => {
  it('keeps local settings navigation functional', () => {
    renderFooter();
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
    expect(screen.getByText('Local settings page')).toBeInTheDocument();
  });
  it('keeps the local theme control', () => {
    renderFooter();
    expect(screen.getByRole('button', { name: 'Theme' })).toBeInTheDocument();
  });
  it('renders no public links, promotions or telemetry', () => {
    const network = vi.spyOn(globalThis, 'fetch');
    const { container } = renderFooter();
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/settings',
    ]);
    expect(container.querySelector('img')).toBeNull();
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
  });
});
