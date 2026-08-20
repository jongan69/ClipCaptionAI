// Preload script — CommonJS on purpose.
//
// The BrowserWindow runs with `sandbox: true`; per Electron's ESM support
// matrix, sandboxed preload scripts cannot be ESM, so this file must stay
// CommonJS. Only this narrow, explicitly-listed bridge is exposed to the
// renderer. Channel names must match desktop/shared/protocol.mjs.
const {contextBridge, ipcRenderer} = require('electron');

const subscribe = (channel, cb) => {
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('cca', {
  // ── Workflow management ──────────────────────────────────────
  listWorkflows: () => ipcRenderer.invoke('cca:list-workflows'),
  getEnvironment: () => ipcRenderer.invoke('cca:get-environment'),
  runWorkflow: (payload) => ipcRenderer.invoke('cca:run-workflow', payload),
  runRawCommand: (payload) => ipcRenderer.invoke('cca:run-raw-command', payload),
  stopWorkflow: (session) => ipcRenderer.invoke('cca:stop-workflow', session),

  // ── Preferences & secrets ────────────────────────────────────
  getPreferences: () => ipcRenderer.invoke('cca:get-preferences'),
  setPreference: (key, value) => ipcRenderer.invoke('cca:set-preference', {key, value}),

  getSecretState: () => ipcRenderer.invoke('cca:get-secret-state'),
  setSecret: (payload) => ipcRenderer.invoke('cca:set-secret', payload),
  clearSecret: (payload) => ipcRenderer.invoke('cca:clear-secret', payload),

  // ── File dialogs & shell ─────────────────────────────────────
  projectRoot: () => ipcRenderer.invoke('cca:project-root'),
  pickPath: (options = {}) => ipcRenderer.invoke('cca:pick-path', options),
  openPath: (targetPath) => ipcRenderer.invoke('cca:open-path', targetPath),
  getLogPath: () => ipcRenderer.invoke('cca:log-path'),
  getPaths: () => ipcRenderer.invoke('cca:get-paths'),

  // ── Output browsing ──────────────────────────────────────────
  listOutputs: () => ipcRenderer.invoke('cca:list-outputs'),

  // ── Project files ────────────────────────────────────────────
  readProjectFile: (name) => ipcRenderer.invoke('cca:read-project-file', name),
  writeProjectFile: (name, content) =>
    ipcRenderer.invoke('cca:write-project-file', {name, content}),

  // ── Video probing (read-only ffprobe) ────────────────────────
  probeVideo: (filePath) => ipcRenderer.invoke('cca:probe-video', filePath),

  // ── Cleanup ──────────────────────────────────────────────────
  cleanup: (scope) => ipcRenderer.invoke('cca:cleanup', {scope}),

  // ── Events (main → renderer) ─────────────────────────────────
  onLog: (callback) => subscribe('cca:workflow-log', callback),
  onComplete: (callback) => subscribe('cca:workflow-complete', callback),
  onEnvironment: (callback) => subscribe('cca:environment', callback),
});
