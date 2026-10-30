'use strict';

const assert = require('node:assert/strict');

// Check the actual protocol produced by OllamaStream while reading the body.
// Chunk boundaries are transport details: one event may span many reads.
async function verifyOllamaChatStream(response) {
  assert(response.ok, `Authenticated application chat HTTP ${response.status}`);
  assert(/^text\/event-stream(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || ''),
    'Application chat did not return an SSE response');
  assert(response.body, 'Application chat response has no stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffered = '', eventLines = [], textEvents = 0, stopEvents = 0, bytes = 0;
  const consume = (event) => {
    const lines = event.split(/\r\n|\r|\n/);
    let type = 'message';
    const data = [];
    for (const line of lines) {
      if (line.startsWith(':') || !line) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') type = value;
      if (field === 'data') data.push(value);
    }
    assert(type !== 'error', 'Application chat stream reported an error');
    if (!data.length) return;
    if (type === 'text') {
      assert.equal(stopEvents, 0, 'Application chat emitted text after completion');
      const value = JSON.parse(data.join('\n'));
      assert.equal(typeof value, 'string', 'Application chat text is invalid');
      if (value.trim()) textEvents++;
    } else if (type === 'stop') {
      assert.equal(JSON.parse(data.join('\n')), 'finished', 'Application chat completion is invalid');
      assert.equal(++stopEvents, 1, 'Application chat completed more than once');
    }
  };
  const drain = (atEnd = false) => {
    // SSE permits CR, LF or CRLF per line, including mixed line endings.
    // Defer a terminal CR until the next chunk decides whether it forms CRLF.
    let match;
    while ((match = /[\r\n]/.exec(buffered))) {
      if (match[0] === '\r' && match.index === buffered.length - 1 && !atEnd) break;
      const line = buffered.slice(0, match.index);
      const width = buffered.slice(match.index, match.index + 2) === '\r\n' ? 2 : 1;
      buffered = buffered.slice(match.index + width);
      if (line) eventLines.push(line);
      else {
        consume(eventLines.join('\n'));
        eventLines = [];
      }
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      assert(bytes <= 1024 * 1024, 'Application chat acceptance response exceeds 1MiB');
      buffered += decoder.decode(value, { stream: true });
      drain();
    }
    buffered += decoder.decode();
    drain(true);
    assert(!buffered.trim() && !eventLines.length, 'Application chat stream ended inside an event');
    assert(textEvents > 0, 'Application chat stream did not contain generated text');
    assert.equal(stopEvents, 1, 'Application chat stream ended before completion');
    return { textEvents, completion: 'finished', bytes };
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

module.exports = { verifyOllamaChatStream };
