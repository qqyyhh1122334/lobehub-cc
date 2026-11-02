const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(resolve(__dirname, '../../public/intranet-browser-guard.js'), 'utf8');
function setup() {
  const calls = [];
  const listeners = {};
  const api = class {
    constructor(...args) {
      calls.push(['constructor', ...args]);
    }
  };
  class XHR {
    open(...args) {
      calls.push(['xhr', ...args]);
    }
  }
  class Form {
    submit() {
      calls.push(['form']);
    }
    requestSubmit() {
      calls.push(['requestSubmit']);
    }
  }
  class SpeechSynthesis {
    speak(...args) {
      calls.push(['speech', ...args]);
    }
    getVoices() {
      return [{ localService: false }];
    }
  }
  const context = vm.createContext({
    URL,
    Request,
    DOMException,
    console,
    location: { origin: 'https://chat.intranet', href: 'https://chat.intranet/chat' },
    navigator: {
      sendBeacon: (...args) => {
        calls.push(['beacon', ...args]);
        return true;
      },
    },
    document: {
      addEventListener: (event, listener) => {
        listeners[event] = listener;
      },
    },
    fetch: (...args) => {
      calls.push(['fetch', ...args]);
      return Promise.resolve({ ok: true });
    },
    open: (...args) => {
      calls.push(['window', ...args]);
      return 'window';
    },
    WebSocket: api,
    EventSource: api,
    Worker: api,
    SharedWorker: api,
    WebTransport: api,
    RTCPeerConnection: api,
    SpeechRecognition: api,
    webkitSpeechRecognition: api,
    speechSynthesis: new SpeechSynthesis(),
    XMLHttpRequest: XHR,
    HTMLFormElement: Form,
  });
  vm.runInContext(source, context);
  return { context, calls, listeners };
}
test('public fetch variants and Request input are rejected before transport', async () => {
  const { context, calls } = setup();
  for (const url of [
    'https://example.com/',
    '//example.com/',
    'https://chat.intranet.evil/',
    'https://chat.intranet@example.com/',
    'https://user:pass@chat.intranet/',
    'http://chat.intranet/',
    'https://chat.intranet:8443/',
    'blob:https://example.com/id',
    new Request('https://example.com/'),
  ]) {
    await assert.rejects(context.fetch(url), { name: 'SecurityError' });
  }
  assert.equal(calls.length, 0);
});
test('same-origin HTTP and SSE work, fetch redirects fail closed', async () => {
  const { context, calls } = setup();
  await context.fetch('/api/chat', { method: 'POST', redirect: 'follow' });
  await context.fetch(new Request('https://chat.intranet/api/status'));
  await context.fetch('data:text/plain,local');
  await context.fetch('blob:https://chat.intranet/id');
  new context.EventSource('/api/events');
  new context.WebSocket('wss://chat.intranet/ws');
  assert.equal(calls[0][2].redirect, 'error');
  assert.equal(calls[0][2].method, 'POST');
  assert.equal(calls[1][2].redirect, 'error');
});
test('XHR, workers, WS, SSE and UDP/WebRTC deny external targets', () => {
  const { context, calls } = setup();
  assert.throws(() => new context.XMLHttpRequest().open('GET', 'https://example.com'), {
    name: 'SecurityError',
  });
  for (const name of ['Worker', 'SharedWorker', 'WebSocket', 'EventSource', 'WebTransport'])
    assert.throws(() => new context[name]('https://example.com'), { name: 'SecurityError' });
  assert.throws(() => new context.RTCPeerConnection(), { name: 'SecurityError' });
  assert.equal(context.navigator.sendBeacon('https://example.com', 'secret'), false);
  assert.equal(calls.length, 0);
  new context.Worker('blob:https://chat.intranet/id');
  new context.Worker('/_spa/worker.js');
  assert.equal(calls.length, 2);
});
test('native browser speech APIs cannot send audio or text to vendor services', () => {
  const { context, calls } = setup();
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition'])
    assert.throws(() => new context[name](), { name: 'SecurityError' });
  assert.throws(() => context.speechSynthesis.speak({ text: 'private text' }), {
    name: 'SecurityError',
  });
  assert.equal(context.speechSynthesis.getVoices().length, 0);
  assert.throws(
    () =>
      Object.getPrototypeOf(context.speechSynthesis).speak.call(context.speechSynthesis, {
        text: 'private text',
      }),
    { name: 'SecurityError' },
  );
  assert.equal(calls.length, 0);
});
test('external window/open, forms, click, auxiliary clicks and ping links are blocked', () => {
  const { context, calls, listeners } = setup();
  assert.throws(() => context.open('https://example.com'), { name: 'SecurityError' });
  const form = new context.HTMLFormElement();
  form.action = 'https://example.com';
  assert.throws(() => form.submit(), { name: 'SecurityError' });
  form.action = '/signin';
  form.submit();
  assert.throws(() => form.requestSubmit({ formAction: 'https://example.com' }), {
    name: 'SecurityError',
  });
  for (const eventName of ['click', 'auxclick']) {
    let prevented = false;
    listeners[eventName]({
      composedPath: () => [
        { matches: () => true, href: 'https://example.com', hasAttribute: () => false },
      ],
      preventDefault: () => {
        prevented = true;
      },
      stopImmediatePropagation() {},
    });
    assert.equal(prevented, true);
  }
  assert.equal(calls.length, 1);
});
test('guard APIs cannot be silently overwritten and repeated installation is idempotent', () => {
  const { context } = setup();
  const original = context.fetch;
  vm.runInContext('fetch = () => true;', context);
  assert.equal(context.fetch, original);
  vm.runInContext(source, context);
  assert.equal(context.fetch, original);
});
test('CSP has no Internet schemes/wildcards and covers every resource destination', () => {
  const policy = readFileSync(
    resolve(__dirname, '../../src/security/intranet/browserPolicy.ts'),
    'utf8',
  );
  for (const directive of [
    'default-src',
    'connect-src',
    'script-src',
    'style-src',
    'img-src',
    'font-src',
    'media-src',
    'worker-src',
    'frame-src',
    'object-src',
    'form-action',
    'base-uri',
    'frame-ancestors',
  ])
    assert.ok(policy.includes(directive), directive);
  assert.ok(policy.includes('"connect-src \'self\' blob: data:"'));
  assert.ok(policy.includes('"frame-src \'none\'"'));
  assert.doesNotMatch(policy, /https?:|\*\s*["']/);
});
test('all static browser entry points load the guard before any other script', () => {
  for (const file of ['index.html', 'index.mobile.html', 'public/not-compatible.html']) {
    const html = readFileSync(resolve(__dirname, '../..', file), 'utf8');
    const firstScript = html.match(/<script\b[^>]*>/)[0];
    assert.ok(firstScript.includes('/intranet-browser-guard.js'), file);
  }
});

test('generated data URLs remain downloadable without enabling data navigation', () => {
  const { listeners } = setup();
  for (const downloadable of [true, false]) {
    let prevented = false;
    listeners.click({
      composedPath: () => [
        {
          matches: () => true,
          href: 'data:image/png;base64,AA',
          hasAttribute: (name) => name === 'download' && downloadable,
        },
      ],
      preventDefault: () => {
        prevented = true;
      },
      stopImmediatePropagation() {},
    });
    assert.equal(prevented, !downloadable);
  }
});
