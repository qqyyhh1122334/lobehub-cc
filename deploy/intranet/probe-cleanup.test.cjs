'use strict';
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// Execute the entire production probe, with controlled service failures.
async function run(options = {}) {
  const events = [], errors = [], queries = [], pools = [], reports = [];
  const process = { env: { APP_URL: 'https://lobe.internal', OLLAMA_PROXY_URL: 'http://172.30.90.13:11434', INTRANET_TEST_EMAIL: 'test@corp.internal', INTRANET_TEST_PASSWORD: 'test-password-123456' } };
  class Pool {
    constructor(config) { pools.push(config); }
    async query(sql, values) {
      if (sql.startsWith('SELECT extname')) return {rowCount: 2};
      events.push('delete-user'); queries.push({ sql, values: [...values] }); if (options.dbFail) throw Error('db failure'); return { rowCount: 1 };
    }
    async end() { events.push('end-db'); }
  }
  class S3Client {
    async send(command, config) { events.push('delete-object'); assert(config.abortSignal); if (options.s3Fail) throw Error('s3 failure'); }
    destroy() { events.push('destroy-s3'); }
  }
  const response = (ok, data, cookies=[]) => ({ ok, status: ok?200:503, json: async()=>data, headers:{getSetCookie:()=>cookies} });
  await vm.runInNewContext(readFileSync(join(__dirname, 'probe-app.cjs'), 'utf8'), {
    require(name) {
      if (name==='/app/migration-check.cjs') return options.complete
        ? { verifyDatabaseMigrations: async()=>({count:105,hashesVerified:true}) }
        : require('./migration-check.cjs');
      if (name==='/app/probe-deadline.cjs') return require('./probe-deadline.cjs');
      if (name==='/app/sse-check.cjs') return require('./sse-check.cjs');
      if (name==='pg') return { Pool };
      if (name==='@aws-sdk/client-s3') return { S3Client, GetObjectCommand: class {}, DeleteObjectCommand: class {} };
      if (name==='@aws-sdk/s3-request-presigner') return { getSignedUrl: async()=>{
        if(options.complete) return 'https://lobe.internal/lobehub-files/test?get';
        throw Error('unexpected');
      } };
      return require(name);
    }, process, AbortSignal, URL, console: { log(message){events.push('report');reports.push(message);}, error(message){errors.push(message);} },
    fetch: async (url) => {
      if(url.endsWith('/sign-up/email')) return response(!options.signupFail, {user: {id: options.missingId ? undefined : 'created-user'} });
      if(url.endsWith('/sign-in/email')) return response(!options.signinFail, {}, ['session=test']);
      if(url.endsWith('/get-session')) {
        if (options.complete) return response(true, {user:{email:process.env.INTRANET_TEST_EMAIL}});
        throw Error('intentional probe failure');
      }
      if(url.endsWith('/sign-out')) { events.push('signout'); return response(!options.signoutFail, {}); }
      if(options.complete) {
        if(url.endsWith('/webapi/chat/ollama')) return new Response('event: text\ndata: "OK"\n\nevent: stop\ndata: "finished"\n\n', {headers:{'content-type':'text/event-stream'}});
        if(url==='https://lobe.internal/') return new Response('', {headers:{'content-security-policy':"connect-src 'self'; default-src 'none'"}});
        if(url.endsWith('/upload.createS3PreSignedUrl')) return response(true, {result:{data:{json:'https://lobe.internal/lobehub-files/test?put'}}});
        if(url.endsWith('?put')) return new Response('');
        if(url.endsWith('?get')) return new Response('intranet upload verified', {headers:{'content-security-policy':'sandbox','content-disposition':'attachment'}});
        if(url.endsWith('/api/tags')) return response(true, {models:[{name:'qwen3:8b'},{name:'bge-m3'}]});
        if(url.endsWith('/api/chat')) return response(true, {message:{content:'OK'}});
        if(url.endsWith('/api/embed')) return response(true, {embeddings:[Array(1024).fill(0)]});
      }
      throw Error('Unexpected request');
    },
  });
  if (!options.complete || options.s3Fail || options.signoutFail || options.dbFail) assert.equal(process.exitCode,1);
  else assert.equal(process.exitCode,undefined);
  return { events, errors, queries, pools, reports };
}
test('S3 deletion failure still signs out and deletes the exact new user', async()=>{
  const r=await run({s3Fail:true});
  assert.deepEqual(r.events,['delete-object','destroy-s3','signout','delete-user','end-db']);
  assert.deepEqual(r.queries,[{sql:'DELETE FROM users WHERE id=$1 AND email=$2',values:['created-user','test@corp.internal']}]);
  assert.match(r.errors[0],/storage-object.*probe also failed/);
});
test('signout failure still attempts database cleanup',async()=>{
 const r=await run({signoutFail:true}); assert(r.events.includes('delete-user')); assert.match(r.errors[0],/session-signout/);
});
test('failed signin does not prevent deletion or retry authentication',async()=>{
 const r=await run({signinFail:true}); assert(r.events.includes('delete-user')); assert(!r.events.includes('signout'));
});
test('all cleanup failures are reported and database pool closes',async()=>{
 const r=await run({s3Fail:true,signoutFail:true,dbFail:true}); assert(r.events.includes('end-db')); assert.match(r.errors[0],/storage-object, session-signout, test-user/);
});
test('failed signup never deletes a pre-existing account',async()=>{
 const r=await run({signupFail:true}); assert.equal(r.queries.length,0);
});
test('missing new identity fails safely without deleting by email',async()=>{
 const r=await run({missingId:true}); assert.equal(r.queries.length,0); assert.match(r.errors[0],/test-user/);
});
test('successful cleanup preserves the original probe failure',async()=>{
 const r=await run(); assert.match(r.errors[0],/intentional probe failure/); assert(!r.errors[0].includes('Cleanup failed'));
});
test('complete probe uses bounded database pools and emits success after cleanup', async()=>{
 const r=await run({complete:true});
 assert.equal(r.errors.length,0);
 assert.equal(r.pools.length,2);
 for(const config of r.pools) {
   assert.equal(config.connectionTimeoutMillis,10000);
   assert.equal(config.statement_timeout,15000);
   assert.equal(config.query_timeout,20000);
 }
 assert.equal(r.events.at(-1),'report');
 assert.equal(r.events.at(-2),'end-db');
 assert.equal(JSON.parse(r.reports[0]).stream.completion,'finished');
});
test('cleanup failure after successful service checks never emits a passing report', async()=>{
 const r=await run({complete:true,s3Fail:true});
 assert.equal(r.reports.length,0);
 assert.match(r.errors[0],/Cleanup failed: storage-object/);
 assert(r.events.includes('delete-user'));
});
