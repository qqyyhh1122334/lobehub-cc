'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyDatabaseMigrations } = require('./migration-check.cjs');
const expected = [{ folderMillis: 100, hash: 'a'.repeat(64) }, { folderMillis: 200, hash: 'b'.repeat(64) }];
const rows = () => expected.map(m => ({ created_at: String(m.folderMillis), hash: m.hash }));
const verify = (data, journal = expected) => verifyDatabaseMigrations({query: async(sql) => {
  assert.equal(sql, 'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id');
  return {rows: data};
}}, '/test/migrations', ({migrationsFolder}) => { assert.equal(migrationsFolder, '/test/migrations'); return journal; });
test('all applied timestamps and hashes match the packaged image', async () => {
 assert.deepEqual(await verify(rows()), {count: 2, lastTimestamp: 200, hashesVerified: true});
});
test('partial nonempty history is rejected', async () => {await assert.rejects(verify(rows().slice(0,1)), /count/);});
test('extra migrations from another image are rejected', async () => {await assert.rejects(verify([...rows(),...rows()]), /count/);});
test('same count but changed SQL hash is rejected', async () => {const r=rows();r[1].hash='c'.repeat(64);await assert.rejects(verify(r), /hash mismatch/);});
test('duplicate or incorrect timestamps are rejected', async () => {const r=rows();r[1].created_at='100';await assert.rejects(verify(r), /timestamp mismatch/);});
test('empty, malformed or unordered packaged journals fail before querying', async () => {
 for(const journal of [[], [...expected].reverse(), [{folderMillis: NaN,hash: 'a'.repeat(64)}], [{folderMillis:100,hash:'bad'}]])
  await assert.rejects(verify([],journal), /Packaged/);
});
test('missing migration source and database errors propagate', async () => {
 await assert.rejects(verifyDatabaseMigrations({},'/missing',()=>{throw Error('missing SQL');}), /missing SQL/);
 await assert.rejects(verifyDatabaseMigrations({query:async()=>{throw Error('database unavailable');}},'/test',()=>expected), /database unavailable/);
});
test('both Docker entrypoints package all local helpers required by the stdin probe', () => {
 const {readFileSync}=require('node:fs');const {join}=require('node:path');
 const probe=readFileSync(join(__dirname,'probe-app.cjs'),'utf8');
 const helpers=[...probe.matchAll(/require\('\/app\/([^']+)'\)/g)].map(match=>match[1]);
 assert(helpers.includes('migration-check.cjs'));
 assert(helpers.includes('probe-deadline.cjs'));
 assert(helpers.includes('sse-check.cjs'));
 for(const name of ['Dockerfile','Dockerfile.intranet']) {
  const docker=readFileSync(join(__dirname,'../..',name),'utf8');
  for(const helper of helpers)assert(docker.includes(`/app/deploy/intranet/${helper} /app/${helper}`), `${name} does not package ${helper}`);
 }
});
