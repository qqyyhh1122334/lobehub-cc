'use strict';

// Test-only fail-closed check: a standalone smoke must never resolve a package
// from the builder checkout, NODE_PATH, or a symlink escaping its runtime tree.
const { realpathSync } = require('node:fs');
const { registerHooks } = require('node:module');
const { resolve, sep } = require('node:path');
const { fileURLToPath } = require('node:url');

const root = realpathSync(resolve(process.env.INTRANET_SMOKE_RUNTIME_ROOT));
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (result.url.startsWith('file:')) {
      const file = realpathSync(fileURLToPath(result.url));
      if (!file.startsWith(root + sep)) {
        throw new Error(`Standalone dependency escaped runtime: ${file}`);
      }
    }
    return result;
  },
});
