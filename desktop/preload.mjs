import {contextBridge, ipcRenderer} from 'electron';

const subscribe = (channel, cb) => {
  const handler = (_, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('cca', {
  listWorkflows: () => ipcRenderer.invoke('cca:list-workflows'),
  getEnvironment: () => ipcRenderer.invoke('cca:get-environment'),
  getPreferences: () => ipcRenderer.invoke('cca:get-preferences'),
  setPreference: (key, value) => ipcRenderer.invoke('cca:set-preference', {key, value}),
  getLogPath: () => ipcRenderer.invoke('cca:log-path'),
  runWorkflow: (payload) => ipcRenderer.invoke('cca:run-workflow', payload),
  runRawCommand: (payload) => ipcRenderer.invoke('cca:run-raw-command', payload),
  pickPath: (options = {}) => ipcRenderer.invoke('cca:pick-path', options),
  stopWorkflow: (session) => ipcRenderer.invoke('cca:stop-workflow', session),
  projectRoot: () => ipcRenderer.invoke('cca:project-root'),
  openPath: (targetPath) => ipcRenderer.invoke('cca:open-path', targetPath),
  onLog: (callback) => subscribe('cca:workflow-log', callback),
  onComplete: (callback) => subscribe('cca:workflow-complete', callback),
  onEnvironment: (callback) => subscribe('cca:environment', callback),
});
