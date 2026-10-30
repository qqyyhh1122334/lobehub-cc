'use strict';

const { isIP } = require('node:net');

const ERROR_CODE = 'LOBE_INTRANET_EGRESS_DENIED';

function denied(reason) {
  const error = new Error(`Intranet network policy: ${reason}`);
  error.code = ERROR_CODE;
  return error;
}

function normalizeHost(value) {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw denied('invalid host');
  }
  let host = value.toLowerCase();
  if (host.startsWith('[') || host.endsWith(']')) {
    if (!host.startsWith('[') || !host.endsWith(']') || isIP(host.slice(1, -1)) !== 6) {
      throw denied('invalid bracketed host');
    }
    host = host.slice(1, -1);
  }
  // Reject zone identifiers, userinfo, URL syntax and wildcard/suffix matching.
  if (/[\s/%@\\*?#]/.test(host)) throw denied('invalid host');
  if (isIP(host)) return host;
  if (host.length > 253 || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)) {
    throw denied('invalid host');
  }
  if (host.split('.').some((label) => !label || label.length > 63 || /^-|-$/.test(label))) {
    throw denied('invalid DNS label');
  }
  return host;
}

function ipv6Value(address) {
  let value = address.toLowerCase();
  if (value.includes('.')) {
    const split = value.lastIndexOf(':');
    const octets = value
      .slice(split + 1)
      .split('.')
      .map(Number);
    value = `${value.slice(0, split)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = value.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const groups =
    halves.length === 1
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  return groups.reduce((total, group) => (total << 16n) | BigInt(`0x${group}`), 0n);
}

function isInternalAddress(address) {
  if (typeof address !== 'string' || address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (family !== 6) return false;
  const value = ipv6Value(address);
  if (value === 1n) return true;
  if (value >> 32n === 0xffffn) {
    const ipv4 = Number(value & 0xffffffffn);
    return isInternalAddress([24, 16, 8, 0].map((shift) => (ipv4 >>> shift) & 255).join('.'));
  }
  return value >> 121n === 0x7en; // fc00::/7, no link-local, multicast or transition ranges
}

function normalizePort(value) {
  if (!/^[0-9]+$/.test(String(value))) throw denied('invalid port');
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw denied('invalid port');
  return port;
}

function createPolicy(value = '') {
  const endpoints = new Set();
  const hosts = new Set();
  for (const entry of value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)) {
    const match = /^(?:\[([^\]]+)\]|([^:]+)):([0-9]+)$/.exec(entry);
    if (!match) throw denied('allowlist entries must be exact host:port pairs');
    const host = normalizeHost(match[1] || match[2]);
    const port = normalizePort(match[3]);
    if (isIP(host) && !isInternalAddress(host))
      throw denied('allowlist cannot contain public or link-local IP addresses');
    endpoints.add(`${host}:${port}`);
    hosts.add(host);
  }

  function assertHost(value) {
    const host = normalizeHost(value);
    if (!hosts.has(host)) throw denied(`host is not allowlisted: ${host}`);
    if (isIP(host) && !isInternalAddress(host)) throw denied('non-internal address');
    return host;
  }

  function assertEndpoint(value, portValue) {
    const host = assertHost(value);
    const port = normalizePort(portValue);
    if (!endpoints.has(`${host}:${port}`))
      throw denied(`endpoint is not allowlisted: ${host}:${port}`);
    return { host, port };
  }

  function assertRecords(records) {
    if (
      !Array.isArray(records) ||
      records.length === 0 ||
      records.some((record) => !isInternalAddress(record.address))
    ) {
      throw denied('DNS returned a public, link-local, invalid or empty address set');
    }
    return records;
  }

  function assertUrl(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw denied('invalid URL');
    }
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol))
      throw denied('unsupported URL protocol');
    if (url.username || url.password) throw denied('URL userinfo is disabled');
    return assertEndpoint(
      url.hostname,
      url.port || (['https:', 'wss:'].includes(url.protocol) ? 443 : 80),
    );
  }

  return Object.freeze({ assertEndpoint, assertHost, assertRecords, assertUrl });
}

module.exports = {
  ERROR_CODE,
  createPolicy,
  denied,
  isInternalAddress,
  normalizeHost,
  normalizePort,
};
