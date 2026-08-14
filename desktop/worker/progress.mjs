/**
 * Progress interceptor for worker threads.
 *
 * Patches console.* and process.stdout/stderr.write to capture all output
 * as structured log events, while forwarding to the real streams.
 */

import { writeSync } from "node:fs";
import { format } from "node:util";

const STDOUT_FD = 1;
const STDERR_FD = 2;

export const sanitizeLogText = (value) =>
  String(value)
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted-api-key]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{16,}\b/gi, "Bearer [redacted]")
    .replace(
      /(["']?(?:api[_-]?key|token|secret|password)["']?\s*[:=]\s*)(["'])[^"'\r\n]*\2/gi,
      "$1$2[redacted]$2",
    )
    .replace(
      /((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[redacted]",
    );

/**
 * Install the interceptor. Returns an uninstall function.
 *
 * @param {function} onEvent — called with { type: 'log', channel, text, timestamp }
 */
export function installProgressInterceptor(onEvent) {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
  };

  const emitLog = (channel, text) => {
    const lines = sanitizeLogText(text).split("\n").filter((l) => l.trim());
    for (const line of lines) {
      onEvent({
        type: "log",
        channel,
        text: line,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Intercept stdout
  process.stdout.write = function (chunk, encoding, callback) {
    const safe = sanitizeLogText(chunk.toString());
    emitLog("stdout", safe);
    return originalStdoutWrite(safe, encoding, callback);
  };

  // Intercept stderr
  process.stderr.write = function (chunk, encoding, callback) {
    const safe = sanitizeLogText(chunk.toString());
    emitLog("stderr", safe);
    return originalStderrWrite(safe, encoding, callback);
  };

  // Intercept console methods
  console.log = (...args) => {
    const safe = sanitizeLogText(format(...args));
    emitLog("stdout", safe);
    writeSync(STDOUT_FD, `${safe}\n`);
  };

  console.error = (...args) => {
    const safe = sanitizeLogText(format(...args));
    emitLog("stderr", safe);
    writeSync(STDERR_FD, `${safe}\n`);
  };

  console.warn = (...args) => {
    const safe = sanitizeLogText(format(...args));
    emitLog("stderr", safe);
    writeSync(STDERR_FD, `${safe}\n`);
  };

  // info goes to stdout
  console.info = (...args) => {
    const safe = sanitizeLogText(format(...args));
    emitLog("stdout", safe);
    writeSync(STDOUT_FD, `${safe}\n`);
  };

  // Return uninstall function
  return () => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
  };
}
