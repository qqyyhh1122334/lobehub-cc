'use strict';

/*
 * Load BEFORE application code: NODE_OPTIONS=--require=/app/scripts/intranet/network-guard.cjs
 * Defense in depth, not a sandbox for native addons or untrusted subprocesses.
 * deploy/intranet's default-deny container network is the primary security boundary.
 */
const dns = require('node:dns');
const dgram = require('node:dgram');
const http = require('node:http');
const http2 = require('node:http2');
const https = require('node:https');
const net = require('node:net');
const { syncBuiltinESMExports } = require('node:module');
const { createPolicy, denied } = require('./network-policy.cjs');

const policy = createPolicy(process.env.LOBE_INTRANET_ALLOWED_ENDPOINTS || '');
for (const name of [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
]) {
  if (process.env[name]) throw denied(`proxy environment variable ${name} must be unset`);
}

const originalLookup = dns.lookup.bind(dns);
const originalConnect = net.Socket.prototype.connect;

function lookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const opts = typeof options === 'number' ? { family: options } : options || {};
  try {
    policy.assertHost(hostname);
  } catch (error) {
    return process.nextTick(callback, error);
  }
  // One OS lookup, validate ALL records and hand the validated result directly to
  // connect. Never validate one resolution then ask the OS to resolve again.
  originalLookup(hostname, { ...opts, all: true }, (error, records) => {
    if (error) return callback(error);
    try {
      policy.assertRecords(records);
    } catch (policyError) {
      return callback(policyError);
    }
    if (opts.all) return callback(null, records);
    callback(null, records[0].address, records[0].family);
  });
}

net.Socket.prototype.connect = function (...args) {
  // Match Node's supported Socket.connect overloads. Node internally also passes
  // a normalized arguments array from net.connect/createConnection.
  if (Array.isArray(args[0])) args = args[0];
  let options;
  let callback;
  if (args[0] && typeof args[0] === 'object') {
    options = { ...args[0] };
    callback = args[1];
  } else {
    options = { port: args[0] };
    if (typeof args[1] === 'string') options.host = args[1];
    callback = typeof args[1] === 'function' ? args[1] : args[2];
  }
  let endpoint;
  try {
    if (options.path != null || (typeof args[0] === 'string' && !/^[0-9]+$/.test(args[0]))) {
      throw denied('Unix domain socket connections are disabled');
    }
    endpoint = policy.assertEndpoint(options.host || 'localhost', options.port);
  } catch (error) {
    // Preserve Socket.connect's asynchronous error contract so drivers such as
    // pg and ws attach their error listeners and clean up the failed connection.
    // No original connect/lookup is invoked on this branch.
    this.connecting = true;
    process.nextTick(() => this.destroy(error));
    return this;
  }
  const { host, port } = endpoint;
  // Replaces caller-controlled lookup functions. Numeric hosts were already
  // checked against the exact endpoint allowlist and private address ranges.
  options = { ...options, host, lookup, port };
  return originalConnect.call(this, options, callback);
};

dns.lookup = lookup;
dns.promises.lookup = (hostname, options) =>
  new Promise((resolve, reject) => {
    lookup(hostname, options, (error, address, family) => {
      if (error) return reject(error);
      resolve(
        options && typeof options === 'object' && options.all ? address : { address, family },
      );
    });
  });

// No application-controlled DNS servers or DNS tunnelling. Service discovery uses
// exact allowlisted hosts through the deployment's non-forwarding local resolver.
function noDns() {
  throw denied('direct DNS queries and custom DNS servers are disabled');
}
for (const target of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const key of new Set([
    ...Object.keys(target),
    ...Object.getOwnPropertyNames(target),
    'reverse',
    'setServers',
    'setLocalAddress',
    'lookupService',
  ])) {
    if (
      key.startsWith('resolve') ||
      ['reverse', 'setServers', 'setLocalAddress', 'lookupService'].includes(key)
    ) {
      target[key] = noDns;
    }
  }
}
function noUdp() {
  throw denied('UDP sockets are disabled');
}
for (const name of ['send', 'sendto', 'connect']) dgram.Socket.prototype[name] = noUdp;
dgram.createSocket = noUdp;
dgram.Socket = noUdp;

function wrapRequest(module) {
  const originalRequest = module.request;
  module.request = function (...args) {
    const options = typeof args[0] === 'object' && !(args[0] instanceof URL) ? args[0] : args[1];
    if (options && typeof options === 'object') {
      if (String(options.method || '').toUpperCase() === 'CONNECT')
        throw denied('HTTP CONNECT tunnelling is disabled');
      if (typeof options.path === 'string' && /^[a-z][a-z0-9+.-]*:\/\//i.test(options.path)) {
        throw denied('HTTP forward-proxy requests are disabled');
      }
    }
    if (typeof args[0] === 'string' || args[0] instanceof URL) policy.assertUrl(String(args[0]));
    return originalRequest.apply(this, args);
  };
  module.get = function (...args) {
    const request = module.request(...args);
    request.end();
    return request;
  };
}
wrapRequest(http);
wrapRequest(https);

// HTTP/2 tunnels use session.request(), not http.request(). Validate a snapshot
// of the headers so getters cannot change the method between checking and sending.
// Node 24 accepts both header objects and flat raw-header arrays.
function checkedHttp2Headers(headers) {
  if (!headers || typeof headers !== 'object') return headers;
  const snapshot = Object.assign(Array.isArray(headers) ? [] : Object.create(null), headers);
  if (Array.isArray(headers)) snapshot.length = headers.length;
  const checkMethod = (key) => {
    if (snapshot[key] === undefined) return;
    const method = String(snapshot[key]);
    if (method.trim().toUpperCase() === 'CONNECT')
      throw denied('HTTP/2 CONNECT tunnelling is disabled');
    snapshot[key] = method;
  };
  if (Array.isArray(snapshot)) {
    for (let index = 0; index < snapshot.length; index += 2) {
      if (typeof snapshot[index] === 'string' && snapshot[index].toLowerCase() === ':method')
        checkMethod(index + 1);
    }
  } else {
    for (const key of Object.keys(snapshot)) {
      if (key.toLowerCase() === ':method') checkMethod(key);
    }
  }
  return snapshot;
}
const originalHttp2Connect = http2.connect;
http2.connect = function (...args) {
  const session = originalHttp2Connect.apply(this, args);
  const request = session.request;
  session.request = function (headers, options) {
    // Like Node's header validation and our HTTP/1 guard, policy rejection is
    // synchronous. No stream is created and the session remains usable.
    return request.call(this, checkedHttp2Headers(headers), options);
  };
  return session;
};

const originalFetch = globalThis.fetch;
if (originalFetch) {
  globalThis.fetch = async function (input, init) {
    policy.assertUrl(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    if (String(init?.method || input?.method || '').toUpperCase() === 'CONNECT') {
      throw denied('HTTP CONNECT tunnelling is disabled');
    }
    return originalFetch.call(this, input, init);
  };
}
const OriginalWebSocket = globalThis.WebSocket;
if (OriginalWebSocket) {
  globalThis.WebSocket = class IntranetWebSocket extends OriginalWebSocket {
    constructor(url, protocols) {
      policy.assertUrl(String(url));
      super(url, protocols);
    }
  };
}

syncBuiltinESMExports();
Object.defineProperty(globalThis, Symbol.for('lobehub.intranet.guard'), { value: true });
