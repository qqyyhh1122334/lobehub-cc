'use strict';
const fs = require('node:fs');
const path = require('node:path');

fs.chownSync('/data', 1000, 1000);
fs.chownSync('/redis-data', 999, 999);
// The model directory is dedicated to this deployment. Normalize permissions
// after importing weights from a preparation container; never follow symlinks.
function ownModel(file) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) throw new Error('Model imports must not contain symbolic links');
  fs.chownSync(file, 1000, 1000);
  fs.chmodSync(file, stat.isDirectory() ? 0o750 : 0o640);
  if (stat.isDirectory()) for (const name of fs.readdirSync(file)) ownModel(path.join(file, name));
}
ownModel('/models');
