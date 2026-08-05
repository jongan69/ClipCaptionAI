/**
 * Module registry — maps workflow IDs to their worker module and export name.
 *
 * Each entry: { modulePath: relative path from project root, exportName: function name }
 *
 * Phase 1: Only compress-video is wired in-process; everything else spawns CLI as child process.
 */

const REGISTRY = {
  // Phase 1: In-process modules
  compress: {
    modulePath: "scripts/compress-video.mjs",
    exportName: "runCompress",
    stages: ["Probe", "Encode", "Verify"],
  },

  // Phase 3: Core pipeline (to be refactored)
  transcribe: {
    modulePath: "scripts/transcribe-openai.mjs",
    exportName: "runTranscribe",
    stages: ["Extract Audio", "Transcribe", "Enhance Text"],
  },
  caption: {
    modulePath: "scripts/caption-video.mjs",
    exportName: "runCaption",
    stages: ["Transcribe", "Render"],
  },
  tighten: {
    modulePath: "scripts/tighten-video.mjs",
    exportName: "runTighten",
    stages: ["Analyze", "Detect Cuts"],
  },
  chapter: {
    modulePath: "scripts/chapter-video.mjs",
    exportName: "runChapter",
    stages: ["Analyze", "Detect Chapters"],
  },

  // CLI-spawn fallback (unrefactored modules)
  _cli: null,
};

/**
 * Resolve a module for a given workflow ID.
 * Returns null for CLI-spawn workflows.
 */
export async function resolveModule(moduleId) {
  const entry = REGISTRY[moduleId];

  if (!entry || !entry.modulePath) {
    return null; // Unrefactored; caller spawns CLI
  }

  // Dynamic import of the script module
  const mod = await import(`../../${entry.modulePath}`);
  const fn = mod[entry.exportName];

  if (typeof fn !== "function") {
    throw new Error(
      `Module ${entry.modulePath} exports no function named ${entry.exportName}`
    );
  }

  return fn;
}

/**
 * Get stage definitions for a workflow.
 */
export function getStages(moduleId) {
  return REGISTRY[moduleId]?.stages || [];
}

/**
 * Check if a workflow is available in-process (vs. CLI-spawn).
 */
export function isInProcess(moduleId) {
  return REGISTRY[moduleId]?.modulePath != null;
}

export default REGISTRY;
