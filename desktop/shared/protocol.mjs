/**
 * IPC protocol constants and validators.
 *
 * All channel names and message shapes are defined here so the main process,
 * preload, and renderer share a single source of truth.
 */

// ─── Invoke channels (renderer → main) ───────────────────────────

export const CHANNELS = {
  // Workflow
  LIST_WORKFLOWS: 'cca:list-workflows',
  GET_ENVIRONMENT: 'cca:get-environment',
  RUN_WORKFLOW: 'cca:run-workflow',
  STOP_WORKFLOW: 'cca:stop-workflow',
  LIST_JOBS: 'cca:list-jobs',
  JOB_STATUS: 'cca:job-status',
  JOB_LOGS: 'cca:job-logs',

  // Preferences & secrets
  GET_PREFERENCES: 'cca:get-preferences',
  SET_PREFERENCE: 'cca:set-preference',
  GET_SECRET_STATE: 'cca:get-secret-state',
  SET_SECRET: 'cca:set-secret',
  CLEAR_SECRET: 'cca:clear-secret',

  // File dialogs & shell
  PICK_PATH: 'cca:pick-path',
  OPEN_PATH: 'cca:open-path',
  PROJECT_ROOT: 'cca:project-root',
  LOG_PATH: 'cca:log-path',
  GET_PATHS: 'cca:get-paths',

  // Output browsing
  LIST_OUTPUTS: 'cca:list-outputs',

  // Project files (allowlist only)
  READ_PROJECT_FILE: 'cca:read-project-file',
  WRITE_PROJECT_FILE: 'cca:write-project-file',

  // Video probing (read-only ffprobe)
  PROBE_VIDEO: 'cca:probe-video',

  // Cleanup
  CLEANUP: 'cca:cleanup',
};

// ─── Push channels (main → renderer) ─────────────────────────────

export const EVENTS = {
  ENVIRONMENT: 'cca:environment',

  // Workflow job events
  WORKFLOW_LOG: 'cca:workflow-log',
  WORKFLOW_COMPLETE: 'cca:workflow-complete',
};

// ─── Runtime validators ───────────────────────────────────────────

/**
 * Validate a workflow run request payload.
 */
export function validateRunRequest(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid run request: payload must be an object');
  }
  if (typeof payload.workflowId !== 'string' || !payload.workflowId.trim()) {
    throw new Error('Invalid run request: workflowId is required');
  }
  return {
    workflowId: payload.workflowId.trim(),
    argValues: payload.argValues || {},
    extraArgs: payload.extraArgs || '',
  };
}

/**
 * Validate a settings preference key/value.
 */
export function validatePreference(key) {
  const allowedKeys = ['lastWorkflowId', 'lastExtraArgs', 'formDrafts', 'windowBounds', 'version'];
  if (typeof key !== 'string' || !key.trim()) {
    throw new Error('Invalid preference key');
  }
  if (!allowedKeys.includes(key) && !key.startsWith('form:')) {
    throw new Error(`Unknown preference key: ${key}`);
  }
}

/**
 * Validate a secret key name.
 */
export function validateSecretKey(key, allowedKeys = new Set()) {
  if (!allowedKeys.has(key)) {
    throw new Error(`Unknown secret key: ${key}`);
  }
}
