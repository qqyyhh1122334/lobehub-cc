'use strict';

const { execFileSync } = require('node:child_process');

// Docker errors may include captured output and expanded configuration secrets.
// Only stable stage names and process status belong in the acceptance report.
function runCommand(file, args, { cwd, input, stage = 'docker-command', timeoutMs = 30_000 } = {}) {
  if (!/^[a-z0-9-]+$/.test(stage)) throw new Error('Invalid command stage');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid command deadline');
  try {
    return execFileSync(file, args, {
      cwd, encoding: 'utf8', input,
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    });
  } catch (cause) {
    const timedOut = cause.code === 'ETIMEDOUT';
    const error = new Error(timedOut
      ? `${stage} timed out after ${timeoutMs}ms; container command termination and cleanup are unconfirmed`
      : `${stage} failed (exit ${Number.isInteger(cause.status) ? cause.status : 'unavailable'})`);
    error.code = timedOut ? 'INTRANET_COMMAND_TIMEOUT' : 'INTRANET_COMMAND_FAILED';
    error.stage = stage;
    error.timeoutMs = timeoutMs;
    error.timedOut = timedOut;
    throw error;
  }
}

module.exports = { runCommand };
