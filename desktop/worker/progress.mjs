/**
 * Progress interceptor for worker threads.
 *
 * Patches console.* and process.stdout/stderr.write to capture all output
 * as structured log events, while forwarding to the real streams.
 */

import { writeSync } from "node:fs";

const STDOUT_FD = 1;
const STDERR_FD = 2;

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
    const lines = String(text).split("\n").filter((l) => l.trim());
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
    emitLog("stdout", chunk.toString());
    return originalStdoutWrite(chunk, encoding, callback);
  };

  // Intercept stderr
  process.stderr.write = function (chunk, encoding, callback) {
    emitLog("stderr", chunk.toString());
    return originalStderrWrite(chunk, encoding, callback);
  };

  // Intercept console methods
  console.log = (...args) => {
    emitLog("stdout", args.map(String).join(" "));
    originalConsole.log(...args);
  };

  console.error = (...args) => {
    emitLog("stderr", args.map(String).join(" "));
    originalConsole.error(...args);
  };

  console.warn = (...args) => {
    emitLog("stderr", args.map(String).join(" "));
    originalConsole.warn(...args);
  };

  // info goes to stdout
  console.info = (...args) => {
    emitLog("stdout", args.map(String).join(" "));
    originalConsole.info(...args);
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
