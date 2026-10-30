'use strict';

const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const tls = require('node:tls');
const http = require('node:http');
const http2 = require('node:http2');
const crypto = require('node:crypto');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { ERROR_CODE, createPolicy, isInternalAddress } = require('./network-policy.cjs');

const guard = path.join(__dirname, 'network-guard.cjs');
function run(source, allowlist = '', { prelude, env: additions = {} } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, LOBE_INTRANET_ALLOWED_ENDPOINTS: allowlist, ...additions };
    for (const key of [
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'ALL_PROXY',
      'http_proxy',
      'https_proxy',
      'all_proxy',
      'NODE_OPTIONS',
    ]) {
      delete env[key];
    }
    Object.assign(env, additions);
    const code = `const assert = require('node:assert/strict');
      const expectSocketDenied = factory => assert.rejects(new Promise((resolve, reject) => {
        const socket = factory();
        socket.once('error', reject);
        socket.once('connect', () => { socket.destroy(); reject(new Error('Denied socket unexpectedly connected')); });
      }), { code: '${ERROR_CODE}' });
      ${prelude || ''}; require(${JSON.stringify(guard)}); (async () => { ${source} })().catch(error => { console.error(error); process.exitCode = 1; });`;
    const child = spawn(process.execPath, ['-e', code], { env });
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Guard test timed out: ${output}`));
    }, 10000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}
async function succeeds(source, allowlist, options) {
  const result = await run(source, allowlist, options);
  assert.equal(result.code, 0, result.output);
}

let server;
let port;
let requests = 0;
let h2server;
let h2port;
const h2Methods = [];
before(async () => {
  server = http.createServer((request, response) => {
    requests += 1;
    if (request.url === '/redirect') {
      response.writeHead(302, { location: 'http://203.0.113.8:80/exfiltrate' });
    } else {
      response.writeHead(200, { 'content-type': 'text/plain' });
    }
    response.end('intranet ok');
  });
  server.on('upgrade', (request, socket) => {
    const accept = crypto
      .createHash('sha1')
      .update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n',
    );
    socket.on('data', () => socket.end(Buffer.from([0x88, 0x00])));
  });
  h2server = http2.createServer();
  h2server.on('stream', (stream, headers) => {
    h2Methods.push(headers[':method']);
    stream.respond({ ':status': 200 });
    stream.end('h2 intranet ok');
  });
  await new Promise((resolve) => h2server.listen(0, '127.0.0.1', resolve));
  h2port = h2server.address().port;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => h2server.close(resolve));
});

test('private address policy rejects public, metadata, transition, multicast and unspecified IPs', () => {
  for (const value of [
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.0.1',
    '127.0.0.1',
    '::1',
    'fc00::1',
    'fdff:abcd::1234',
    '::ffff:192.168.1.2',
    '::ffff:c0a8:102',
  ]) {
    assert.equal(isInternalAddress(value), true, value);
  }
  for (const value of [
    '8.8.8.8',
    '169.254.169.254',
    '100.100.100.200',
    '0.0.0.0',
    '172.32.0.1',
    '172.15.0.1',
    '192.169.0.1',
    '255.255.255.255',
    '::',
    'fe80::1',
    'ff02::1',
    '2001:4860:4860::8888',
    '2002:c0a8:0101::',
    '64:ff9b::c0a8:101',
    '::ffff:8.8.8.8',
    'fc00::1%eth0',
    '127.1',
    '2130706433',
    '0x7f000001',
  ]) {
    assert.equal(isInternalAddress(value), false, value);
  }
});

test('allowlist is exact and cannot enable public addresses or wildcards', () => {
  const policy = createPolicy('model:8000,127.0.0.1:3210,[::1]:3210');
  assert.deepEqual(policy.assertEndpoint('model', 8000), { host: 'model', port: 8000 });
  for (const pair of [
    ['model', 80],
    ['sub.model', 8000],
    ['model.evil', 8000],
    ['model.', 8000],
    ['127.0.0.1', 3211],
  ]) {
    assert.throws(() => policy.assertEndpoint(...pair), { code: ERROR_CODE });
  }
  for (const entry of [
    '8.8.8.8:53',
    '169.254.169.254:80',
    '*.internal:80',
    'model:*',
    'model:0',
    'model:65536',
    'https://model:443',
    'model@evil:80',
  ]) {
    assert.throws(() => createPolicy(entry), { code: ERROR_CODE }, entry);
  }
});

test('DNS validation rejects mixed public/private records', () => {
  const policy = createPolicy('model:8000');
  assert.throws(() => policy.assertRecords([{ address: '10.0.0.1' }, { address: '8.8.8.8' }]), {
    code: ERROR_CODE,
  });
  assert.throws(() => policy.assertRecords([]), { code: ERROR_CODE });
});

test('default deny blocks fetch and raw socket before outbound access', async () => {
  await succeeds(`
    await expectSocketDenied(() => require('node:net').connect(443, 'example.com'));
    await expectSocketDenied(() => require('node:tls').connect(443, '203.0.113.1'));
    assert.throws(() => require('node:http').get('http://example.com'), { code: '${ERROR_CODE}' });
    await assert.rejects(fetch('https://example.com'), { code: '${ERROR_CODE}' });
    assert.throws(() => new WebSocket('wss://example.com'), { code: '${ERROR_CODE}' });
  `);
});

test('approved local HTTP and fetch retain functionality', async () => {
  const before = requests;
  await succeeds(
    `
    assert.equal(await (await fetch('http://127.0.0.1:${port}/')).text(), 'intranet ok');
    await new Promise((resolve, reject) => require('node:http').get('http://127.0.0.1:${port}/', response => {
      let data = ''; response.on('data', chunk => data += chunk); response.on('end', () => { assert.equal(data, 'intranet ok'); resolve(); });
    }).on('error', reject));
  `,
    `127.0.0.1:${port}`,
  );
  assert.equal(requests - before, 2);
});

test('DNS-based connection works and caller-supplied lookup cannot replace approved resolution', async () => {
  await succeeds(
    `
    await new Promise((resolve, reject) => require('node:http').get({
      host: 'localhost', port: ${port}, family: 4,
      lookup: () => { throw new Error('untrusted lookup must never run'); }
    }, response => { response.resume(); response.on('end', resolve); }).on('error', reject));
    const result = await require('node:dns').promises.lookup('localhost', { family: 4 });
    assert.equal(result.address, '127.0.0.1');
  `,
    `localhost:${port}`,
  );
});

test('DNS resolution is pinned once, with no second lookup on connect', async () => {
  await succeeds(
    `
    assert.equal(await (await fetch('http://rebind.test:${port}/')).text(), 'intranet ok');
    assert.equal(dnsCalls, 1);
  `,
    `rebind.test:${port}`,
    {
      prelude: `
    let dnsCalls = 0;
    require('node:dns').lookup = (host, options, callback) => {
      dnsCalls += 1;
      callback(null, [{ address: dnsCalls === 1 ? '127.0.0.1' : '203.0.113.1', family: 4 }]);
    };
  `,
    },
  );
});

test('approved hostname resolving public fails closed before connect', async () => {
  await succeeds(
    `
    await assert.rejects(fetch('http://rebind.test:${port}/'), error => error.cause?.code === '${ERROR_CODE}');
  `,
    `rebind.test:${port}`,
    {
      prelude: `
    require('node:dns').lookup = (host, options, callback) => callback(null, [{ address: '203.0.113.1', family: 4 }]);
  `,
    },
  );
});

test('HTTP redirect to public destination fails closed', async () => {
  const before = requests;
  await succeeds(
    `await assert.rejects(fetch('http://127.0.0.1:${port}/redirect'), error => error.cause?.code === '${ERROR_CODE}');`,
    `127.0.0.1:${port}`,
  );
  assert.equal(requests - before, 1);
});

test('CONNECT, forward-proxy requests, UDP and Unix sockets are rejected', async () => {
  await succeeds(
    `
    assert.throws(() => require('node:http').request({ host: '127.0.0.1', port: ${port}, method: 'CONNECT', path: 'example.com:443' }), { code: '${ERROR_CODE}' });
    assert.throws(() => require('node:http').request({ host: '127.0.0.1', port: ${port}, path: 'https://example.com/' }), { code: '${ERROR_CODE}' });
    assert.throws(() => require('node:dgram').createSocket('udp4'), { code: '${ERROR_CODE}' });
    assert.throws(() => new (require('node:dgram').Socket)('udp4'), { code: '${ERROR_CODE}' });
    await expectSocketDenied(() => require('node:net').connect('/var/run/docker.sock'));
  `,
    `127.0.0.1:${port}`,
  );
});

test('direct DNS, custom resolvers and nonallowlisted lookups fail closed', async () => {
  await succeeds(`
    const dns = require('node:dns');
    assert.throws(() => dns.resolveTxt('exfil.example.com', () => {}), { code: '${ERROR_CODE}' });
    assert.throws(() => dns.setServers(['8.8.8.8']), { code: '${ERROR_CODE}' });
    assert.throws(() => new dns.Resolver().setServers(['8.8.8.8']), { code: '${ERROR_CODE}' });
    assert.throws(() => new dns.promises.Resolver().setServers(['8.8.8.8']), { code: '${ERROR_CODE}' });
    assert.throws(() => new dns.Resolver().resolve4('example.com', () => {}), { code: '${ERROR_CODE}' });
    assert.throws(() => new dns.promises.Resolver().resolve4('example.com'), { code: '${ERROR_CODE}' });
    await assert.rejects(dns.promises.lookup('exfil.example.com'), { code: '${ERROR_CODE}' });
  `);
});

test('configured proxy causes startup failure without exposing credentials', async () => {
  const result = await run('throw new Error("must not start");', '', {
    env: { HTTPS_PROXY: 'https://username:private-password@proxy.invalid' },
  });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /proxy environment variable HTTPS_PROXY must be unset/);
  assert.doesNotMatch(result.output, /private-password/);
});

test('ESM builtin imports also enforce policy', async () => {
  await succeeds(`
    const { connect } = await import('node:net');
    const { createSocket } = await import('node:dgram');
    await expectSocketDenied(() => connect(443, 'example.com'));
    assert.throws(() => createSocket('udp6'), { code: '${ERROR_CODE}' });
  `);
});

test('raw TLS and HTTP/2 cannot connect to public endpoints', async () => {
  await succeeds(`
    await expectSocketDenied(() => require('node:tls').connect({ host: '203.0.113.8', port: 443 }));
    await expectSocketDenied(() => require('node:http2').connect('https://203.0.113.8'));
  `);
});

test('explicit numeric endpoint checks preserve port restrictions and IPv6 policy', async () => {
  await succeeds(
    `
    await expectSocketDenied(() => require('node:net').connect(444, '127.0.0.1'));
    await expectSocketDenied(() => require('node:net').connect({ host: '::ffff:203.0.113.1', port: 443 }));
    await expectSocketDenied(() => require('node:net').connect({ host: 'fe80::1', port: 443 }));
    assert.equal(globalThis[Symbol.for('lobehub.intranet.guard')], true);
    assert.throws(() => Object.defineProperty(globalThis, Symbol.for('lobehub.intranet.guard'), { value: false }), TypeError);
  `,
    '127.0.0.1:443,[::1]:443',
  );
});

test('mutating environment after startup cannot widen immutable endpoint policy', async () => {
  await succeeds(`
    process.env.LOBE_INTRANET_ALLOWED_ENDPOINTS = '127.0.0.1:${port}';
    await assert.rejects(fetch('http://127.0.0.1:${port}'), { code: '${ERROR_CODE}' });
  `);
});

test('approved HTTP/2 and browser-standard WebSocket remain functional', async () => {
  await succeeds(
    `
    const h2 = require('node:http2').connect('http://127.0.0.1:${h2port}');
    await new Promise((resolve, reject) => {
      const request = h2.request({ ':path': '/' }); let body = '';
      request.on('data', chunk => body += chunk);
      request.on('end', () => { assert.equal(body, 'h2 intranet ok'); resolve(); });
      request.on('error', reject); request.end();
    });
    h2.close();
    await new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://127.0.0.1:${port}');
      ws.addEventListener('open', () => ws.close());
      ws.addEventListener('close', resolve);
      ws.addEventListener('error', reject);
    });
  `,
    `127.0.0.1:${port},127.0.0.1:${h2port}`,
  );
});

test('HTTP/2 CONNECT variants never reach the allowed local server and keep the session usable', async () => {
  const before = h2Methods.length;
  await succeeds(
    `
    const { connect } = await import('node:http2');
    const session = connect('http://127.0.0.1:${h2port}');
    const errors = [];
    session.on('error', error => errors.push(error));
    for (const headers of [
      { ':method': 'CONNECT', ':authority': 'forbidden-public.invalid:443' },
      { ':method': 'connect', ':authority': 'forbidden-public.invalid:443' },
      { ':method': 'CoNnEcT', ':authority': 'forbidden-public.invalid:443' },
      { ':METHOD': 'CONNECT', ':authority': 'forbidden-public.invalid:443' },
      { ':method': ['CONNECT'], ':authority': 'forbidden-public.invalid:443' },
      { ':method': 'CONNECT', ':protocol': 'websocket', ':path': '/', ':authority': 'forbidden-public.invalid:443' },
      [':method', 'CONNECT', ':authority', 'forbidden-public.invalid:443'],
      [':METHOD', 'connect', ':authority', 'forbidden-public.invalid:443'],
    ]) {
      assert.throws(() => session.request(headers), { code: '${ERROR_CODE}' });
      assert.equal(session.destroyed, false);
      assert.equal(session.closed, false);
    }
    let methodReads = 0;
    const headers = {
      ':path': '/',
      get ':method'() { methodReads++; return methodReads === 1 ? 'GET' : 'CONNECT'; },
    };
    await new Promise((resolve, reject) => {
      const request = session.request(headers); let body = '';
      request.on('data', chunk => body += chunk);
      request.on('end', () => { assert.equal(body, 'h2 intranet ok'); resolve(); });
      request.on('error', reject); request.end();
    });
    assert.equal(methodReads, 1);
    await new Promise((resolve, reject) => {
      const request = session.request([':method', 'GET', ':path', '/']);
      request.resume(); request.on('end', resolve); request.on('error', reject); request.end();
    });
    await new Promise(resolve => session.close(resolve));
    assert.equal(errors.length, 0);
    `,
    `127.0.0.1:${h2port}`,
  );
  // The only destination is our local fixture; no public connection is attempted.
  assert.deepEqual(h2Methods.slice(before), ['GET', 'GET']);
});

test('approved TLS connection verifies a local certificate and retains SNI', async (context) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lobe-intranet-tls-'));
  const keyPath = path.join(temp, 'key.pem');
  const certPath = path.join(temp, 'cert.pem');
  let tlsServer;
  try {
    try {
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          keyPath,
          '-out',
          certPath,
          '-subj',
          '/CN=localhost',
          '-addext',
          'subjectAltName=DNS:localhost,IP:127.0.0.1',
          '-days',
          '1',
        ],
        { stdio: 'ignore' },
      );
    } catch (error) {
      if (error.code === 'ENOENT')
        return context.skip(
          'openssl is needed only to generate the temporary TLS test certificate',
        );
      throw error;
    }
    tlsServer = tls.createServer(
      { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
      (socket) => socket.end('tls intranet ok'),
    );
    await new Promise((resolve) => tlsServer.listen(0, '127.0.0.1', resolve));
    const tlsPort = tlsServer.address().port;
    await succeeds(
      `
      await new Promise((resolve, reject) => {
        const socket = require('node:tls').connect({ host: 'localhost', family: 4, servername: 'localhost', port: ${tlsPort}, ca: require('node:fs').readFileSync(${JSON.stringify(certPath)}) });
        let body = '';
        socket.on('data', chunk => body += chunk);
        socket.on('end', () => { assert.equal(socket.authorized, true); assert.equal(body, 'tls intranet ok'); resolve(); });
        socket.on('error', reject);
      });
    `,
      `localhost:${tlsPort}`,
    );
  } finally {
    if (tlsServer) await new Promise((resolve) => tlsServer.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

function hasDependency(name) {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

test(
  'installed undici request and ws clients honor allowed endpoints and reject Internet',
  { skip: !hasDependency('undici') || !hasDependency('ws') },
  async () => {
    await succeeds(
      `
    const { request } = require('undici');
    const response = await request('http://127.0.0.1:${port}/');
    assert.equal(await response.body.text(), 'intranet ok');
    await assert.rejects(request('http://203.0.113.8'), error => error.code === '${ERROR_CODE}' || error.cause?.code === '${ERROR_CODE}');
    const WS = require('ws');
    await assert.rejects(new Promise((resolve, reject) => { const socket = new WS('ws://203.0.113.8'); socket.on('error', reject); socket.on('open', () => { socket.close(); reject(new Error('Public WebSocket connected')); }); }), { code: '${ERROR_CODE}' });
    await new Promise((resolve, reject) => {
      const socket = new WS('ws://127.0.0.1:${port}');
      socket.on('open', () => socket.close()); socket.on('close', resolve); socket.on('error', reject);
    });
  `,
      `127.0.0.1:${port}`,
    );
  },
);

test(
  'installed PostgreSQL client can complete local startup and cannot connect publicly',
  { skip: !hasDependency('pg') },
  async () => {
    // Minimal PostgreSQL startup fixture: AuthenticationOk + ReadyForQuery. This
    // verifies transport compatibility; database migrations are tested separately.
    const pgServer = require('node:net').createServer((socket) => {
      let started = false;
      socket.on('data', () => {
        if (started) return;
        started = true;
        socket.write(Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0, 0x5a, 0, 0, 0, 5, 0x49]));
      });
    });
    await new Promise((resolve) => pgServer.listen(0, '127.0.0.1', resolve));
    const pgPort = pgServer.address().port;
    try {
      await succeeds(
        `
      const { Client } = require('pg');
      const local = new Client({ host: '127.0.0.1', port: ${pgPort}, user: 'transport-test', database: 'transport-test', connectionTimeoutMillis: 2000 });
      await local.connect(); await local.end();
      const remote = new Client({ host: '203.0.113.8', port: 5432, user: 'transport-test', connectionTimeoutMillis: 2000 });
      await assert.rejects(async () => remote.connect(), { code: '${ERROR_CODE}' });
      await remote.end();
    `,
        `127.0.0.1:${pgPort}`,
      );
    } finally {
      await new Promise((resolve) => pgServer.close(resolve));
    }
  },
);

test(
  'installed Redis client can ping local transport and cannot connect publicly',
  { skip: !hasDependency('ioredis') },
  async () => {
    const redisServer = require('node:net').createServer((socket) => {
      let buffer = '';
      socket.on('data', (data) => {
        buffer += data.toString();
        while (buffer) {
          const header = /^\*(\d+)\r\n/.exec(buffer);
          if (!header) return;
          let position = header[0].length;
          const args = [];
          for (let i = 0; i < Number(header[1]); i++) {
            const field = /^\$(\d+)\r\n/.exec(buffer.slice(position));
            if (!field) return;
            position += field[0].length;
            const length = Number(field[1]);
            if (buffer.length < position + length + 2) return;
            args.push(buffer.slice(position, position + length));
            position += length + 2;
          }
          buffer = buffer.slice(position);
          socket.write(args[0].toLowerCase() === 'ping' ? '+PONG\r\n' : '+OK\r\n');
        }
      });
    });
    await new Promise((resolve) => redisServer.listen(0, '127.0.0.1', resolve));
    const redisPort = redisServer.address().port;
    try {
      await succeeds(
        `
      const Redis = require('ioredis');
      const local = new Redis({ host: '127.0.0.1', port: ${redisPort}, lazyConnect: true, enableReadyCheck: false, retryStrategy: () => null });
      local.on('error', () => {}); await local.connect(); assert.equal(await local.ping(), 'PONG'); local.disconnect();
      const remote = new Redis({ host: '203.0.113.8', port: 6379, lazyConnect: true, connectTimeout: 2000, retryStrategy: () => null });
      remote.on('error', () => {}); await assert.rejects(async () => remote.connect()); remote.disconnect();
    `,
        `127.0.0.1:${redisPort}`,
      );
    } finally {
      await new Promise((resolve) => redisServer.close(resolve));
    }
  },
);
