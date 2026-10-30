'use strict';

function validateCaptureStatistics(stderr) {
  const statistics = {};
  for (const [key, label] of Object.entries({
    captured: 'captured',
    received: 'received by filter',
    dropped: 'dropped by kernel',
  })) {
    const matches = [...stderr.matchAll(new RegExp(`^(\\d+) packets? ${label}\\r?$`, 'gm'))];
    if (matches.length !== 1 || !Number.isSafeInteger(Number(matches[0][1])))
      throw new Error('Packet capture statistics missing or invalid; evidence is incomplete');
    statistics[key] = Number(matches[0][1]);
  }
  if (statistics.dropped !== 0)
    throw new Error('Packet capture dropped packets; evidence is incomplete');
  return statistics;
}

// Observe from spawn time: a failed or interrupted capture cannot prove zero egress.
function observeCapture(child, timeoutMs = 10_000) {
  let outcome;
  let exited = false;
  let ready = false;
  let stderr = '';
  let finishReady;
  const readiness = new Promise((resolve) => {
    finishReady = resolve;
  });
  let finish;
  const completion = new Promise((resolve) => {
    finish = resolve;
  });
  const onData = (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4096);
    if (stderr.includes('listening on')) {
      ready = true;
      finishReady(true);
    }
  };
  child.stderr.on('data', onData);
  const complete = (result) => {
    if (outcome) return;
    outcome = result;
    child.stderr.removeListener('data', onData);
    finishReady(false);
    finish(result);
  };
  child.once('error', () => complete({ error: true }));
  child.once('exit', () => {
    exited = true;
    finishReady(false);
  });
  // 'exit' can precede the final stderr data. Wait for closed streams before
  // validating tcpdump's final capture/drop counters.
  child.once('close', (code, signal) => complete({ code, signal }));
  const bounded = async (promise, message) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const assertRunning = () => {
    if (outcome || exited || child.exitCode !== null || child.signalCode !== null)
      throw new Error('Packet capture exited before the probe window completed');
  };
  return {
    async waitReady() {
      if (!(await bounded(readiness, 'Packet capture did not start')) || !ready)
        throw new Error('Packet capture failed before readiness');
      assertRunning();
    },
    async stop(requestStop) {
      assertRunning();
      await requestStop();
      const result = await bounded(completion, 'Packet capture did not stop');
      if (result.error || result.code !== 0 || result.signal)
        throw new Error('Packet capture did not exit successfully; evidence is incomplete');
      return validateCaptureStatistics(stderr);
    },
  };
}

module.exports = { observeCapture, validateCaptureStatistics };
