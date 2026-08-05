import { contextBridge, ipcRenderer } from "electron";

const subscribe = (channel, cb) => {
  const handler = (_, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("cca", {
  // ── Workflow management ──────────────────────────────────────
  listWorkflows: () => ipcRenderer.invoke("cca:list-workflows"),
  getEnvironment: () => ipcRenderer.invoke("cca:get-environment"),
  runWorkflow: (payload) => ipcRenderer.invoke("cca:run-workflow", payload),
  runRawCommand: (payload) => ipcRenderer.invoke("cca:run-raw-command", payload),
  stopWorkflow: (session) => ipcRenderer.invoke("cca:stop-workflow", session),

  // ── Preferences & secrets ────────────────────────────────────
  getPreferences: () => ipcRenderer.invoke("cca:get-preferences"),
  setPreference: (key, value) =>
    ipcRenderer.invoke("cca:set-preference", { key, value }),

  getSecretState: () => ipcRenderer.invoke("cca:get-secret-state"),
  setSecret: (payload) => ipcRenderer.invoke("cca:set-secret", payload),
  clearSecret: (payload) => ipcRenderer.invoke("cca:clear-secret", payload),

  // ── File dialogs & shell ─────────────────────────────────────
  projectRoot: () => ipcRenderer.invoke("cca:project-root"),
  pickPath: (options = {}) => ipcRenderer.invoke("cca:pick-path", options),
  openPath: (targetPath) => ipcRenderer.invoke("cca:open-path", targetPath),
  getLogPath: () => ipcRenderer.invoke("cca:log-path"),
  getPaths: () => ipcRenderer.invoke("cca:get-paths"),

  // ── Output browsing ──────────────────────────────────────────
  listOutputs: () => ipcRenderer.invoke("cca:list-outputs"),
  openOutput: (path) => ipcRenderer.invoke("cca:open-output", path),

  // ── Project files ────────────────────────────────────────────
  readProjectFile: (name) => ipcRenderer.invoke("cca:read-project-file", name),
  writeProjectFile: (name, content) =>
    ipcRenderer.invoke("cca:write-project-file", { name, content }),

  // ── Cleanup ──────────────────────────────────────────────────
  cleanup: (scope) => ipcRenderer.invoke("cca:cleanup", { scope }),

  // ── Events (main → renderer) ─────────────────────────────────
  onLog: (callback) => subscribe("cca:workflow-log", callback),
  onComplete: (callback) => subscribe("cca:workflow-complete", callback),
  onEnvironment: (callback) => subscribe("cca:environment", callback),
  onJobLog: (callback) => subscribe("cca:job-log", callback),
  onJobProgress: (callback) => subscribe("cca:job-progress", callback),
  onJobComplete: (callback) => subscribe("cca:job-complete", callback),
  onSettingsChanged: (callback) => subscribe("cca:settings-changed", callback),
});
