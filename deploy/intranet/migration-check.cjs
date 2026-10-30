'use strict';
const assert = require('node:assert/strict');

// Use the same reader/hash implementation as the actual Drizzle migrator.
async function verifyDatabaseMigrations(database, migrationsFolder = '/app/migrations', readMigrations) {
  const reader = readMigrations || require('drizzle-orm/migrator').readMigrationFiles;
  const expected = reader({ migrationsFolder });
  assert(Array.isArray(expected) && expected.length > 0, 'Packaged migration journal is empty');
  let previous = -1;
  for (const migration of expected) {
    assert(Number.isSafeInteger(migration.folderMillis) && migration.folderMillis > previous,
      'Packaged migration timestamps are invalid or unordered');
    assert(typeof migration.hash === 'string' && /^[a-f0-9]{64}$/.test(migration.hash),
      'Packaged migration hash is invalid');
    previous = migration.folderMillis;
  }
  const result = await database.query(
    'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id',
  );
  assert.equal(result.rows.length, expected.length, 'Applied migration count does not match this image');
  for (let i = 0; i < expected.length; i++) {
    assert.equal(String(result.rows[i].created_at), String(expected[i].folderMillis),
      `Migration timestamp mismatch at journal entry ${i}`);
    assert.equal(result.rows[i].hash, expected[i].hash, `Migration hash mismatch at journal entry ${i}`);
  }
  return { count: expected.length, lastTimestamp: previous, hashesVerified: true };
}
module.exports = { verifyDatabaseMigrations };
