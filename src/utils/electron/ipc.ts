import type { DesktopIpcServices } from './contract';

/** Electron and its subprocess/network capabilities are absent from this web distribution. */
export const ensureElectronIpc = (): DesktopIpcServices => {
  throw new Error('Desktop IPC is disabled in the intranet web build.');
};
