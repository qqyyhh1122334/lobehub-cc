'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { verifyDatabaseMigrations } = require('/app/migration-check.cjs');
const { armProbeDeadline } = require('/app/probe-deadline.cjs');
const { verifyOllamaChatStream } = require('/app/sse-check.cjs');

const clearDeadline = armProbeDeadline();

(async () => {
  const origin = process.env.APP_URL;
  const email = process.env.INTRANET_TEST_EMAIL;
  const password = process.env.INTRANET_TEST_PASSWORD;
  assert(
    email && password?.length >= 16,
    'INTRANET_TEST_EMAIL and a 16+ character INTRANET_TEST_PASSWORD are required',
  );
  const request = (path, init = {}) =>
    fetch(`${origin}${path}`, {
      ...init,
      signal: AbortSignal.timeout(120_000),
      headers: { 'Origin': origin, 'Content-Type': 'application/json', ...init.headers },
    });
  let cookie;
  let created = false;
  let createdId;
  let probeFailure;
  let migrationEvidence;
  let applicationEvidence;
  let streamEvidence;
  const key = `acceptance/${randomUUID()}.txt`;
  const s3 = new S3Client({
    endpoint: origin,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  try {
    const signup = await request('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email, password, name: 'Isolated deployment acceptance' }),
    });
    assert(signup.ok, `Use a NEW allowed test account; signup HTTP ${signup.status}`);
    created = true;
    createdId = (await signup.json()).user?.id;
    assert(createdId, 'Signup did not return the new user identity');
    const signupCookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    if (signupCookie)
      await request('/api/auth/sign-out', {
        method: 'POST',
        headers: { Cookie: signupCookie },
        body: '{}',
      });
    const signin = await request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    assert(signin.ok, `Password sign-in HTTP ${signin.status}`);
    cookie = signin.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    assert(cookie, 'No authentication cookie');
    const session = await request('/api/auth/get-session', { headers: { Cookie: cookie } });
    assert.equal((await session.json()).user?.email, email);
    const appChat = await request('/webapi/chat/ollama', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({
        model: 'qwen3:8b',
        messages: [{ role: 'user', content: 'Reply with OK. /no_think' }],
        stream: true,
        max_tokens: 32,
        temperature: 0,
      }),
    });
    streamEvidence = await verifyOllamaChatStream(appChat);

    const page = await request('/');
    assert(page.ok, `Application page HTTP ${page.status}`);
    const csp = page.headers.get('content-security-policy') || '';
    assert(
      csp.includes("connect-src 'self'") && csp.includes("default-src 'none'"),
      'Missing strict page CSP',
    );
    const upload = await request('/trpc/lambda/upload.createS3PreSignedUrl', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({ json: { pathname: key } }),
    });
    assert(upload.ok, `Authenticated upload API HTTP ${upload.status}`);
    const result = await upload.json();
    const signedPut = result.result?.data?.json;
    assert.equal(new URL(signedPut).origin, origin, 'Upload must stay same-origin');
    const put = await fetch(signedPut, {
      method: 'PUT',
      body: 'intranet upload verified',
      headers: { 'Content-Type': 'text/plain' },
      signal: AbortSignal.timeout(15_000),
    });
    assert(put.ok, `Signed S3 PUT HTTP ${put.status}`);
    const signedGet = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: 'lobehub-files', Key: key }),
      { expiresIn: 60 },
    );
    const get = await fetch(signedGet, { signal: AbortSignal.timeout(15_000) });
    assert.equal(await get.text(), 'intranet upload verified');
    assert(
      (get.headers.get('content-security-policy') || '').includes('sandbox'),
      'Uploaded content lacks sandbox CSP',
    );
    assert.equal(get.headers.get('content-disposition'), 'attachment');

    const tagsResponse = await fetch(`${process.env.OLLAMA_PROXY_URL}/api/tags`, {
      signal: AbortSignal.timeout(15_000),
    });
    assert(tagsResponse.ok, 'Ollama tags failed');
    const tags = await tagsResponse.json();
    for (const model of ['qwen3:8b', 'bge-m3'])
      assert(
        tags.models?.some((item) => item.name === model || item.name === `${model}:latest`),
        `Missing preloaded model ${model}`,
      );
    const chat = await fetch(`${process.env.OLLAMA_PROXY_URL}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model: 'qwen3:8b',
        messages: [{ role: 'user', content: 'Reply with OK. /no_think' }],
        stream: false,
        options: { num_predict: 64 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    assert(
      chat.ok && (await chat.json()).message?.content?.length,
      'Local model failed to generate text',
    );
    const embedding = await fetch(`${process.env.OLLAMA_PROXY_URL}/api/embed`, {
      method: 'POST',
      body: JSON.stringify({ model: 'bge-m3', input: 'Internal knowledge base acceptance' }),
      signal: AbortSignal.timeout(120_000),
    });
    assert.equal(
      (await embedding.json()).embeddings?.[0]?.length,
      1024,
      'Knowledge embedding must match the database vector dimension',
    );
    const database = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 15_000,
      query_timeout: 20_000,
    });
    try {
      const extensions = await database.query(
        "SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_search')",
      );
      assert.equal(extensions.rowCount, 2, 'Both vector and pg_search are mandatory');
      migrationEvidence = await verifyDatabaseMigrations(database);
    } finally {
      await database.end();
    }
    applicationEvidence = {
        signup: 'passed',
        passwordSignin: 'passed',
        session: 'passed',
        applicationChatStream: 'passed',
        stream: streamEvidence,
        signedStorage: 'passed',
        pageCsp: 'passed',
        uploadedContentSandbox: 'passed',
        modelChat: 'passed',
        embeddingDimensions: 1024,
        migrations: migrationEvidence,
    };
  } catch (error) {
    probeFailure = error;
    throw error;
  } finally {
    // Independent cleanup stages: storage/auth failure must not leave a known
    // disposable account behind. Never delete by email alone.
    const failed = [];
    const attempt = async (stage, action) => {
      try { await action(); } catch { failed.push(stage); }
    };
    await attempt('storage-object', () => s3.send(
      new DeleteObjectCommand({ Bucket: 'lobehub-files', Key: key }),
      { abortSignal: AbortSignal.timeout(15_000) },
    ));
    await attempt('storage-client', () => s3.destroy());
    if (created) {
      if (cookie) await attempt('session-signout', async () => {
        const response = await request('/api/auth/sign-out', {
          method: 'POST', headers: { Cookie: cookie }, body: '{}',
        });
        assert(response.ok, 'Signout failed');
      });
      await attempt('test-user', async () => {
        assert(createdId, 'Cannot safely clean up an unknown test user');
        const cleanup = new Pool({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 10_000,
          statement_timeout: 15_000,
          query_timeout: 20_000,
        });
        try {
          // Sessions/accounts cascade from the exact created user, even when
          // authentication is unavailable and a session cannot be signed out.
          const deleted = await cleanup.query('DELETE FROM users WHERE id=$1 AND email=$2', [createdId, email]);
          assert.equal(deleted.rowCount, 1, 'Test user cleanup failed');
        } finally {
          await cleanup.end();
        }
      });
    }
    if (failed.length) throw new AggregateError(
      probeFailure ? [probeFailure] : [],
      `Cleanup failed: ${failed.join(', ')}; ${probeFailure ? 'probe also failed' : 'inspect before retrying acceptance'}`,
    );
  }
  // A passing result is emitted only after all cleanup stages succeed.
  console.log(JSON.stringify(applicationEvidence));
})().catch((error) => {
  console.error(`Application acceptance failed: ${error.message}`);
  process.exitCode = 1;
}).finally(clearDeadline);
