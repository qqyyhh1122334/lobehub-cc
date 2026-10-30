'use strict';

// Run after installing the frozen lockfile. These checks use the actual pinned
// Drizzle reader and packaged SQL; the database rows are fixtures, not a live DB.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const test = require('node:test');
const { readMigrationFiles } = require('drizzle-orm/migrator');
const { verifyDatabaseMigrations } = require('./migration-check.cjs');

const source = resolve(__dirname, '../../packages/database/migrations');
const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8'));
const rows = journal.entries.map((entry) => ({
  created_at: String(entry.when),
  hash: createHash('sha256').update(readFileSync(join(source, `${entry.tag}.sql`))).digest('hex'),
}));

test('the pinned Drizzle reader loads all 105 packaged SQL files with matching timestamps and hashes', async () => {
  const actual = readMigrationFiles({ migrationsFolder: source });
  assert.equal(actual.length, 105);
  assert.deepEqual(actual.map((entry) => ({ created_at: String(entry.folderMillis), hash: entry.hash })), rows);
  const evidence = await verifyDatabaseMigrations({ query: async () => ({ rows }) }, source);
  assert.deepEqual(evidence, { count: 105, lastTimestamp: journal.entries.at(-1).when, hashesVerified: true });
});

test('the real reader rejects SQL drift and missing packaged SQL before granting migration evidence', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'intranet-migrations-'));
  try {
    mkdirSync(join(folder, 'meta'));
    copyFileSync(join(source, 'meta/_journal.json'), join(folder, 'meta/_journal.json'));
    for (const entry of journal.entries) copyFileSync(join(source, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    const file = join(folder, `${journal.entries[0].tag}.sql`);
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n-- changed SQL\n`);
    await assert.rejects(verifyDatabaseMigrations({ query: async () => ({ rows }) }, folder), /Migration hash mismatch/);
    rmSync(file);
    let queried = false;
    await assert.rejects(verifyDatabaseMigrations({ query: async () => { queried = true; return { rows }; } }, folder), /No file/);
    assert.equal(queried, false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
