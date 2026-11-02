import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureElectronIpc } from '../../src/utils/electron/ipc.ts';

test('the web build rejects desktop IPC without a browser window', () => {
  assert.throws(ensureElectronIpc, /Desktop IPC is disabled in the intranet web build/);
});

test('an injected Electron preload cannot enable desktop subprocess or network capabilities', () => {
  let invoked = false;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        invoke: () => {
          invoked = true;
          throw new Error('Unexpected desktop capability invocation');
        },
      },
    },
  });
  try {
    assert.throws(ensureElectronIpc, /Desktop IPC is disabled in the intranet web build/);
    assert.equal(invoked, false);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
  }
});
