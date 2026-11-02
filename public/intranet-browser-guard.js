/* Intranet distribution: defense in depth. CSP and client network isolation remain required. */
(() => {
  'use strict';
  if (globalThis.__INTRANET_BROWSER_GUARD__) return;
  Object.defineProperty(globalThis, '__INTRANET_BROWSER_GUARD__', { value: true });
  const origin = location.origin;
  const navigationMessage = () =>
    /^zh/i.test(document.documentElement?.lang || navigator.language || '')
      ? '内网版本已禁止跳转至外部网站。'
      : 'External navigation is disabled in the intranet edition.';
  const isLocal = (value, allowBlob = false) => {
    try {
      const url = new URL(value, location.href);
      return (
        (url.protocol === 'http:' ||
          url.protocol === 'https:' ||
          url.protocol === 'ws:' ||
          url.protocol === 'wss:' ||
          (allowBlob && url.protocol === 'blob:')) &&
        url.origin.replace(/^ws/, 'http') === origin &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  };
  const denied = () =>
    new DOMException('External connections are disabled in the intranet edition.', 'SecurityError');
  const check = (url, blobs = false) => {
    if (!isLocal(url, blobs)) throw denied();
  };
  const immutable = (object, key, value) => {
    try {
      Object.defineProperty(object, key, { configurable: false, writable: false, value });
    } catch {
      object[key] = value;
    }
  };
  const originalFetch = globalThis.fetch;
  if (originalFetch)
    immutable(globalThis, 'fetch', function (input, init) {
      try {
        const url = input instanceof Request ? input.url : String(input);
        // Local generated files and data URLs perform no network I/O.
        if (!url.startsWith('data:')) check(url, true);
      } catch (error) {
        return Promise.reject(error);
      }
      // Never follow a same-origin response to a third-party redirect.
      return originalFetch.call(this, input, { ...init, redirect: 'error' });
    });
  if (globalThis.XMLHttpRequest) {
    const open = XMLHttpRequest.prototype.open;
    immutable(XMLHttpRequest.prototype, 'open', function (method, url, ...rest) {
      check(url);
      return open.call(this, method, url, ...rest);
    });
  }
  for (const name of ['WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'WebTransport']) {
    const Original = globalThis[name];
    if (!Original) continue;
    const Guarded = new Proxy(Original, {
      construct(target, args, newTarget) {
        check(args[0], name === 'Worker' || name === 'SharedWorker');
        return Reflect.construct(target, args, newTarget);
      },
    });
    immutable(globalThis, name, Guarded);
  }
  if (navigator.sendBeacon) {
    const beacon = navigator.sendBeacon.bind(navigator);
    immutable(navigator, 'sendBeacon', (url, data) => (isLocal(url) ? beacon(url, data) : false));
  }
  // WebRTC can perform UDP/STUN outside connect-src. This edition has no remote media calls.
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
    if (globalThis[name])
      immutable(globalThis, name, function () {
        throw denied();
      });
  }
  // Browser speech services can use vendor networks outside fetch/CSP. Use audio
  // returned by an administrator-approved same-origin speech service instead.
  function deniedSpeech() {
    throw new DOMException(
      'Native browser speech is disabled. Use an administrator-approved intranet speech service.',
      'SecurityError',
    );
  }
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
    if (globalThis[name]) immutable(globalThis, name, deniedSpeech);
  }
  if (globalThis.speechSynthesis) {
    const targets = [globalThis.speechSynthesis];
    const prototype = Object.getPrototypeOf(globalThis.speechSynthesis);
    if (prototype && Object.prototype.hasOwnProperty.call(prototype, 'speak'))
      targets.push(prototype);
    for (const target of targets) {
      immutable(target, 'speak', deniedSpeech);
      immutable(target, 'getVoices', () => []);
    }
  }
  const openWindow = globalThis.open;
  if (openWindow)
    immutable(globalThis, 'open', function (url, ...args) {
      check(url || location.href, true);
      return openWindow.call(this, url, ...args);
    });
  const isLocalDownload = (anchor) =>
    anchor?.hasAttribute?.('download') && /^data:/i.test(anchor.href || '');
  const stopExternalNavigation = (event) => {
    const path = event.composedPath?.() || [event.target];
    const anchor =
      path.find((element) => element?.matches?.('a[href],area[href]')) ||
      event.target?.closest?.('a[href],area[href]');
    if (
      anchor &&
      ((!isLocal(anchor.href, true) && !isLocalDownload(anchor)) || anchor.hasAttribute('ping'))
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  document.addEventListener('click', stopExternalNavigation, true);
  document.addEventListener('auxclick', stopExternalNavigation, true);
  const sanitizeLink = (anchor) => {
    if (!anchor?.hasAttribute?.('href')) return;
    if (!isLocal(anchor.href, true) && !isLocalDownload(anchor)) {
      anchor.removeAttribute('href');
      anchor.setAttribute('aria-disabled', 'true');
      anchor.setAttribute('title', navigationMessage());
    }
    anchor.removeAttribute('ping');
  };
  document.addEventListener(
    'contextmenu',
    (event) => sanitizeLink(event.target?.closest?.('a[href],area[href]')),
    true,
  );
  if (globalThis.MutationObserver) {
    const sanitizeTree = (node) => {
      if (node?.matches?.('a[href],area[href]')) sanitizeLink(node);
      for (const anchor of node?.querySelectorAll?.('a[href],area[href]') || [])
        sanitizeLink(anchor);
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') sanitizeLink(record.target);
        for (const node of record.addedNodes || []) sanitizeTree(node);
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['href', 'ping'],
    });
  }

  document.addEventListener(
    'submit',
    (event) => {
      const action = event.submitter?.formAction || event.target.action;
      if (!isLocal(action)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  if (globalThis.HTMLFormElement) {
    for (const method of ['submit', 'requestSubmit']) {
      const original = HTMLFormElement.prototype[method];
      if (!original) continue;
      immutable(HTMLFormElement.prototype, method, function (submitter) {
        check(submitter?.formAction || this.action || location.href);
        return original.call(this, submitter);
      });
    }
  }
  // Unregister legacy workers from a prior deployment. A fresh intranet origin is
  // still required: an already-controlling worker survives until its old tabs close.
  // New service worker registration is disabled.
  if (navigator.serviceWorker) {
    immutable(navigator.serviceWorker, 'register', () => Promise.reject(denied()));
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      })
      .catch(() => {});
  }
})();
