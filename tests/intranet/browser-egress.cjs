/* Real Chromium verification. No external site is contacted: a second local origin is the denied sink. */
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { resolvePlaywright } = require('./playwright-runtime.cjs');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const { INTRANET_CSP } = await import(
    pathToFileURL(path.join(root, 'src/security/intranet/browserPolicy.ts'))
  );
  const { chromium } = require(resolvePlaywright(root));
  let deniedRequests = 0;
  let localRequests = 0;
  const denied = http.createServer((_req, res) => {
    deniedRequests++;
    res.end('forbidden sink');
  });
  denied.on('upgrade', (_req, socket) => {
    deniedRequests++;
    socket.destroy();
  });
  await new Promise((resolve) => denied.listen(0, '127.0.0.1', resolve));
  const outside = `http://127.0.0.1:${denied.address().port}`;
  const allowed = http.createServer((req, res) => {
    res.setHeader('Content-Security-Policy', INTRANET_CSP);
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    if (req.url === '/intranet-browser-guard.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(readFileSync(path.join(root, 'public/intranet-browser-guard.js')));
    } else if (req.url === '/api') {
      localRequests++;
      res.end('local success');
    } else if (req.url === '/redirect') {
      res.writeHead(302, { Location: outside + '/redirected' });
      res.end();
    } else if (req.url === '/worker.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(
        `fetch(${JSON.stringify(outside + '/worker-fetch')}).then(()=>postMessage('leak')).catch(()=>postMessage('blocked'));`,
      );
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><html><head><script src="/intranet-browser-guard.js"></script></head><body>intranet test</body></html>',
      );
    }
  });
  await new Promise((resolve) => allowed.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${allowed.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        ...JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS || '[]'),
      ],
    });
    const page = await browser.newPage();
    await page.goto(origin);
    const result = await page.evaluate(async (outside) => {
      const blocked = [];
      const fail = async (name, fn) => {
        try {
          await fn();
        } catch {
          blocked.push(name);
        }
      };
      const ok = await fetch('/api').then((r) => r.text());
      const data = await fetch('data:text/plain,offline-data').then((r) => r.text());
      const blobUrl = URL.createObjectURL(new Blob(['offline-file']));
      const blob = await fetch(blobUrl).then((r) => r.text());
      URL.revokeObjectURL(blobUrl);
      await fail('fetch', () => fetch(outside));
      await fail('redirect', () => fetch('/redirect'));
      await fail('xhr', () => {
        const req = new XMLHttpRequest();
        req.open('GET', outside);
        req.send();
      });
      await fail('websocket', () => new WebSocket(outside.replace('http:', 'ws:')));
      await fail('eventsource', () => new EventSource(outside));
      await fail('worker', () => new Worker(outside + '/worker.js'));
      if (globalThis.WebTransport)
        await fail('webtransport', () => new WebTransport(outside.replace('http:', 'https:')));
      const nativeSpeech = {};
      for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
        if (!globalThis[name]) {
          nativeSpeech[name] = 'unavailable';
          continue;
        }
        try {
          new globalThis[name]();
          nativeSpeech[name] = 'allowed';
        } catch (error) {
          nativeSpeech[name] = error.name;
        }
      }
      if (globalThis.speechSynthesis) {
        try {
          speechSynthesis.speak(new SpeechSynthesisUtterance('intranet smoke test'));
          nativeSpeech.synthesis = 'allowed';
        } catch (error) {
          nativeSpeech.synthesis = error.name;
        }
      } else nativeSpeech.synthesis = 'unavailable';
      await fail(
        'webrtc',
        () => new RTCPeerConnection({ iceServers: [{ urls: 'stun:example.com:3478' }] }),
      );
      await fail('window.open', () => window.open(outside));
      await fail('form', () => {
        const form = document.createElement('form');
        form.action = outside;
        document.body.append(form);
        form.submit();
      });
      const beaconBlocked = !navigator.sendBeacon(outside, 'sensitive');
      // CSP must independently protect parser- and DOM-initiated requests.
      const probes = [];
      for (const [tag, attr, suffix] of [
        ['img', 'src', 'image'],
        ['script', 'src', 'script'],
        ['link', 'href', 'stylesheet'],
        ['iframe', 'src', 'iframe'],
      ]) {
        const element = document.createElement(tag);
        if (tag === 'link') element.rel = 'stylesheet';
        probes.push(
          new Promise((resolve) => {
            element.onload = () => resolve('loaded');
            element.onerror = () => resolve('blocked');
          }),
        );
        element[attr] = outside + '/' + suffix;
        document.body.append(element);
      }
      const style = document.createElement('style');
      style.textContent = `@import url('${outside}/css-import'); @font-face { font-family: leak; src: url('${outside}/font.woff2'); } body { background-image: url('${outside}/background'); font-family: leak; }`;
      document.head.append(style);
      const anchor = document.createElement('a');
      anchor.href = outside + '/click';
      document.body.append(anchor);
      anchor.click();
      const linkPing = document.createElement('a');
      linkPing.href = '/api';
      linkPing.ping = outside + '/ping';
      document.body.append(linkPing);
      linkPing.click();
      const localWorker = await new Promise((resolve) => {
        const worker = new Worker('/worker.js');
        worker.onmessage = (event) => {
          worker.terminate();
          resolve(event.data);
        };
        worker.onerror = () => {
          worker.terminate();
          resolve('blocked');
        };
      });
      const blobWorker = await new Promise((resolve) => {
        const blob = new Blob([`importScripts(${JSON.stringify(outside + '/import-script')})`], {
          type: 'text/javascript',
        });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);
        worker.onerror = (event) => {
          event.preventDefault();
          worker.terminate();
          URL.revokeObjectURL(url);
          resolve('blocked');
        };
        worker.onmessage = () => {
          worker.terminate();
          resolve('unexpected message');
        };
      });
      // Give the local controlled sink time to receive any parser network activity.
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        ok,
        data,
        blob,
        blocked,
        beaconBlocked,
        localWorker,
        blobWorker,
        nativeSpeech,
        location: location.origin,
      };
    }, outside);
    assert.equal(result.ok, 'local success');
    assert.equal(result.data, 'offline-data');
    assert.equal(result.blob, 'offline-file');
    assert.equal(result.location, origin);
    assert.equal(result.beaconBlocked, true);
    assert.equal(result.localWorker, 'blocked');
    assert.equal(result.blobWorker, 'blocked');
    for (const [name, state] of Object.entries(result.nativeSpeech))
      assert.ok(['SecurityError', 'unavailable'].includes(state), name);
    for (const name of [
      'fetch',
      'redirect',
      'xhr',
      'websocket',
      'eventsource',
      'worker',
      'webrtc',
      'window.open',
      'form',
    ])
      assert.ok(result.blocked.includes(name), name);
    assert.equal(localRequests, 1);
    assert.equal(deniedRequests, 0, 'a forbidden request reached the second origin');
    process.stdout.write(
      JSON.stringify(
        {
          passed: true,
          allowedRequests: localRequests,
          forbiddenRequests: deniedRequests,
          checks: result,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    if (browser) await browser.close();
    allowed.closeAllConnections();
    denied.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => allowed.close(resolve)),
      new Promise((resolve) => denied.close(resolve)),
    ]);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
