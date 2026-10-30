'use strict';

// Intentionally run WITHOUT the preload. This tests the container's kernel
// boundary that also contains native code and child processes.
const assert = require('node:assert/strict');
const net = require('node:net');
const { Resolver } = require('node:dns').promises;
const dgram = require('node:dgram');

function connect(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('error', reject);
    socket.setTimeout(4000, () => socket.destroy(new Error('Probe timeout')));
  });
}

(async () => {
  await connect('172.30.90.11', 6379);
  for (const host of ['1.1.1.1', '2606:4700:4700::1111', '169.254.169.254']) {
    await assert.rejects(connect(host, 443), `Unexpected connection to ${host}`);
  }
  const local = new Resolver({ timeout: 1000, tries: 1 });
  local.setServers(['172.30.90.53']);
  await assert.rejects(
    local.resolve4(`egress-probe-${Date.now()}.example.com`),
    (error) => error.code === 'ENOTFOUND',
  );
  const external = new Resolver({ timeout: 1000, tries: 1 });
  external.setServers(['1.1.1.1']);
  await assert.rejects(external.resolve4(`egress-probe-${Date.now()}.example.com`));
  await new Promise((resolve) => {
    const udp = dgram.createSocket('udp4');
    let finished = false;
    const done = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        udp.close();
        resolve();
      }
    };
    const timer = setTimeout(done, 1000);
    udp.on('error', done);
    udp.connect(443, '1.1.1.1', () => udp.send(Buffer.alloc(0), () => {}));
  });
  // UDP send alone has no delivery acknowledgement: packet capture and kernel
  // counters in accept.mjs supply the evidence that the datagram was blocked.
  console.log(
    JSON.stringify({
      kernelTcpEgress: 'denied',
      internalRedis: 'reachable',
      externalDns: 'denied',
      authoritativeDns: 'NXDOMAIN',
      udp443: 'probed; require zero-packet capture',
    }),
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
