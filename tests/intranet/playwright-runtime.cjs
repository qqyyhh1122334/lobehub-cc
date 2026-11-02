'use strict';

const { createRequire } = require('node:module');

// pnpm exposes the declared @playwright/test package at the project root, while
// its playwright dependency remains private to that package's dependency tree.
function resolveProjectPlaywright(root) {
  const testEntry = require.resolve('@playwright/test', { paths: [root] });
  return createRequire(testEntry).resolve('playwright');
}

function resolvePlaywright(root) {
  try {
    return require.resolve('playwright', {
      paths: [root, process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean),
    });
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    return resolveProjectPlaywright(root);
  }
}

module.exports = { resolvePlaywright, resolveProjectPlaywright };
