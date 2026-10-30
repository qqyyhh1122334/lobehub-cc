'use strict';

// The host killing docker exec does not stop the process inside the container.
// This independent deadline bounds that process even if an SDK/socket stalls.
function armProbeDeadline(timeoutMs = 600_000) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid probe deadline');
  const timer = setTimeout(() => {
    console.error('Application acceptance timed out; temporary account and object cleanup are unconfirmed');
    process.exit(1);
  }, timeoutMs);
  timer.unref();
  return () => clearTimeout(timer);
}

module.exports = { armProbeDeadline };
