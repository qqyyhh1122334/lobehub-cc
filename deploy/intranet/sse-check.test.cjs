'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyOllamaChatStream } = require('./sse-check.cjs');
const text = 'id: chat_fixture\nevent: text\ndata: "中文 OK"\n\n';
const stop = 'id: chat_fixture\nevent: stop\ndata: "finished"\n\n';
function response(source = text + stop, { width = Infinity, contentType = 'text/event-stream; charset=utf-8', status = 200 } = {}) {
  const bytes = new TextEncoder().encode(source);
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += width) controller.enqueue(bytes.slice(i, i + width));
    controller.close();
  } }), { headers: { 'content-type': contentType }, status });
}
test('actual Ollama text and finished protocol passes regardless of transport chunk boundaries', async () => {
  for (const width of [1, 2, 7, Infinity]) {
    const result = await verifyOllamaChatStream(response(text + stop, { width }));
    assert.equal(result.textEvents, 1);
    assert.equal(result.completion, 'finished');
    assert.equal(result.bytes, Buffer.byteLength(text + stop));
  }
});
test('CRLF, comments, blank text chunks and usage metadata are accepted', async () => {
  const source = ': heartbeat\n\nevent: text\ndata: ""\n\n' + text + stop + 'event: usage\ndata: {}\n\n';
  assert.equal((await verifyOllamaChatStream(response(source.replaceAll('\n', '\r\n'), {width:1}))).textEvents, 1);
  let i = 0;
  const mixed = source.replaceAll('\n', () => ['\r\n', '\n', '\r'][i++ % 3]);
  assert.equal((await verifyOllamaChatStream(response(mixed, {width:1}))).textEvents, 1);
});
test('text-only and incomplete final events cannot pass as a completed stream', async () => {
  await assert.rejects(verifyOllamaChatStream(response(text)), /before completion/);
  await assert.rejects(verifyOllamaChatStream(response(text + stop.trimEnd())), /inside an event/);
});
test('missing text, malformed text, duplicate completion and post-completion text fail', async () => {
  for (const source of [stop, 'event: text\ndata: {}\n\n' + stop, text + stop + stop, text + stop + text,
    text + 'event: stop\ndata: "unexpected"\n\n']) await assert.rejects(verifyOllamaChatStream(response(source)));
});
test('SSE error events fail even after generated text or without a data field', async () => {
  for (const source of [text + 'event: error\ndata: {}\n\n' + stop, text + 'event: error\n\n' + stop])
    await assert.rejects(verifyOllamaChatStream(response(source)), /reported an error/);
});
test('a response must be successful and explicitly use SSE content type', async () => {
  await assert.rejects(verifyOllamaChatStream(response(undefined, {status:503})), /HTTP 503/);
  for (const contentType of ['', 'text/plain', 'text/event-stream-malformed'])
    await assert.rejects(verifyOllamaChatStream(response(undefined, {contentType})), /SSE response/);
});
test('stream read errors and invalid UTF-8 fail', async () => {
  const broken = new Response(new ReadableStream({ start(controller) {controller.error(Error('transport ended'));} }),
    {headers:{'content-type':'text/event-stream'}});
  await assert.rejects(verifyOllamaChatStream(broken), /transport ended/);
  const invalid = new Response(new Uint8Array([255]), {headers:{'content-type':'text/event-stream'}});
  await assert.rejects(verifyOllamaChatStream(invalid), /encoded data/);
});
test('unexpectedly large probe responses fail with bounded memory', async () => {
  await assert.rejects(verifyOllamaChatStream(response('x'.repeat(1024 * 1024 + 1))), /exceeds 1MiB/);
});
