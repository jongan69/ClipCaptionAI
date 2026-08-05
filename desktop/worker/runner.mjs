/**
 * Worker thread entry point.
 *
 * Receives { type: 'init', moduleId, options, session } from main process,
 * dynamically imports the target module, calls its exported function,
 * and streams log/progress/result events back.
 *
 * Cancellation: receives { type: 'cancel' } → triggers AbortSignal.
 */

import { parentPort } from "node:worker_threads";
import { installProgressInterceptor } from "./progress.mjs";
import { resolveModule } from "./registry.mjs";

// State
let abortController = null;

parentPort.on("message", async (msg) => {
  switch (msg.type) {
    case "init":
      await handleInit(msg);
      break;
    case "cancel":
      if (abortController) abortController.abort();
      break;
    default:
      break;
  }
});

async function handleInit({ moduleId, options = {}, session }) {
  abortController = new AbortController();

  // Intercept console/stdout/stderr → structured log events
  const uninstall = installProgressInterceptor((event) => {
    parentPort.postMessage({ ...event, session });
  });

  try {
    // Resolve and load the target module
    const mod = await resolveModule(moduleId);

    if (!mod) {
      throw new Error(`Unknown module: ${moduleId}`);
    }

    // Call the module's exported function
    const result = await mod(options, {
      signal: abortController.signal,
      onProgress: (progress) => {
        parentPort.postMessage({
          type: "progress",
          session,
          ...progress,
        });
      },
    });

    uninstall();

    parentPort.postMessage({
      type: "result",
      session,
      ok: true,
      artifacts: result.artifacts || [],
      summary: result.summary || "",
      data: result,
    });
  } catch (error) {
    uninstall();

    parentPort.postMessage({
      type: "error",
      session,
      ok: false,
      message: error.message,
      stack: error.stack,
    });
  }
}
