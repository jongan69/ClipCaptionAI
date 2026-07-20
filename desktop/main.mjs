#!/usr/bin/env node
import {app, BrowserWindow, dialog, ipcMain, Menu, shell} from 'electron';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CLI_ENTRY = path.join(PROJECT_ROOT, 'bin', 'clipcaptionai.js');
const WORKFLOWS_PATH = path.join(__dirname, 'workflows.json');
const APP_NAME = 'ClipCaptionAI Desktop';
const DEFAULT_WINDOW_BOUNDS = {width: 1320, height: 900, x: undefined, y: undefined};
const DEFAULT_WINDOW_SETTINGS = {width: 1320, height: 900};

const BASE_WORKFLOWS = loadJsonOrThrow(WORKFLOWS_PATH, []);
let WORKFLOWS = [...BASE_WORKFLOWS];
const CLIPKIT_HELP_COMMAND = ['--help'];
const JOBS = new Map();
const LOG_ROTATE_BYTES = 10 * 1024 * 1024;
const PREFS_VERSION = 2;
const gotSingleInstance = app.requestSingleInstanceLock();
if (!gotSingleInstance) {
  app.quit();
}

app.on('second-instance', () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
});

let preferences = null;
let preferencesPath = null;
let runtimeEnvironment = null;
let detectedCommands = null;
let detectedCommandMetadata = null;
let workflowValidation = null;
let runtimeDiagnostics = null;
let mainWindow = null;
let LOG_PATH = null;
let ipcHandlersInstalled = false;

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadJsonOrThrow(filePath, fallback = null) {
  const value = readJson(filePath, fallback);
  if (!value) {
    throw new Error(`Failed to read required JSON file: ${filePath}`);
  }
  return value;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, {recursive: true});
}

function sanitizeLogText(input = '') {
  return String(input)
    .replace(/sk-[A-Za-z0-9]{20,}/g, '[redacted-openai-key]')
    .replace(/\r?\n/g, ' ');
}

function normalizeLine(input = '') {
  return String(input).trim();
}

function parseArgString(input = '') {
  const tokens = [];
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s"]+)/g;
  let match = regex.exec(input);

  while (match) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
    match = regex.exec(input);
  }

  return tokens;
}

function sanitizeRawTokens(input = '') {
  const tokens = parseArgString(input).filter(Boolean);

  while (tokens.length > 0) {
    const token = tokens[0];
    const next = tokens[1];
    if (token === 'node' && next && /(clipkit\.mjs|clipcaptionai\.js)$/.test(next)) {
      tokens.shift();
      tokens.shift();
      continue;
    }

    if (
      ['npx', 'node', 'clipcaptionai', 'npm'].includes(token)
      || /(.*\/)?clipcaptionai\.js$/.test(token)
      || /(.*\/)?clipkit\.mjs$/.test(token)
    ) {
      tokens.shift();
      continue;
    }

    if (token === 'npm' && next === 'run') {
      tokens.shift();
      tokens.shift();
      if (tokens[0] === '--') {
        tokens.shift();
      }
      continue;
    }

    break;
  }

  if (tokens[0] === '--') {
    tokens.shift();
  }

  return tokens;
}

function makeTitleFromCommand(command = '') {
  return command
    .split('-')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ');
}

function buildArgvFromInput(command, argValues = {}, extraArgs = '') {
  const argv = [CLI_ENTRY, command];
  const args = [];

  for (const [name, value] of Object.entries(argValues)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    if (typeof value === 'boolean') {
      if (value) {
        args.push(`--${name}`);
      }

      continue;
    }

    args.push(`--${name}`, String(value));
  }

  for (const token of parseArgString(extraArgs)) {
    args.push(token);
  }

  return argv.concat(args);
}

function commandExists(command) {
  try {
    const checkCommand = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(checkCommand, [command], {stdio: 'ignore'});
    return result.status === 0;
  } catch {
    return false;
  }
}

function gatherEnvironment() {
  const required = [
    {name: 'node', pretty: 'Node.js'},
    {name: 'ffmpeg', pretty: 'ffmpeg'},
    {name: 'ffprobe', pretty: 'ffprobe'},
  ];

  const optional = [
    {name: 'yt-dlp', pretty: 'yt-dlp'},
    {name: 'remotion', pretty: 'Remotion CLI'},
    {name: 'openai', pretty: 'openai CLI'},
  ];

  const results = {
    projectRoot: PROJECT_ROOT,
    required: [],
    optional: [],
    files: [],
    passed: true,
    asar: app.isPackaged,
  };

  for (const item of required) {
    const ok = commandExists(item.name);
    if (!ok) {
      results.passed = false;
      results.required.push(item.pretty);
    }
  }

  const requiredFiles = [
    path.join(PROJECT_ROOT, 'bin', 'clipcaptionai.js'),
    path.join(PROJECT_ROOT, 'scripts', 'clipkit.mjs'),
  ];

  for (const filePath of requiredFiles) {
    if (!fs.existsSync(filePath)) {
      results.files.push(filePath);
      results.passed = false;
    }
  }

  for (const item of optional) {
    if (!commandExists(item.name)) {
      results.optional.push(item.pretty);
    }
  }

  return results;
}

function safeSend(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

function rotateIfNeeded() {
  if (!LOG_PATH || !fs.existsSync(LOG_PATH)) {
    return;
  }

  const size = fs.statSync(LOG_PATH).size;
  if (size >= LOG_ROTATE_BYTES) {
    const rotated = `${LOG_PATH}.old`;
    try {
      fs.renameSync(LOG_PATH, rotated);
    } catch {
      fs.writeFileSync(LOG_PATH, '', 'utf8');
    }
  }
}

function parseAvailableCommands(helpText = '') {
  const detected = new Map();
  const lines = String(helpText).split('\n');
  let inCommands = false;

  for (const line of lines) {
    if (line.startsWith('Commands:')) {
      inCommands = true;
      continue;
    }

    if (!inCommands) {
      continue;
    }

    if (!/^  /.test(line)) {
      break;
    }

    const match = line.match(/^  ([a-zA-Z0-9-_\|]+)\s{2,}(.*)$/);
    if (!match) {
      continue;
    }

    const entry = match[1];
    const rawDescription = normalizeLine(match[2]);
    const description = rawDescription.replace(/^\[[^\]]+\]\s*/, '');
    const aliases = entry
      .split('|')
      .map((alias) => alias.trim())
      .filter(Boolean);
    const command = aliases[0];

    if (!command || command === 'help') {
      continue;
    }

    if (!detected.has(command)) {
      detected.set(command, {
        command,
        aliases,
        description,
      });
    }
  }

  return [...detected.values()];
}

function getAvailableCommands() {
  const result = spawnSync('node', [CLI_ENTRY, ...CLIPKIT_HELP_COMMAND], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: 20_000,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`clipkit --help exited with code ${result.status}`);
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return parseAvailableCommands(output);
}

function buildWorkflowCatalogFromCommands(manifest, detectedCommands = []) {
  const workflows = [];
  const commandIndex = new Set();
  const idIndex = new Set();

  for (const entry of manifest || []) {
    const command = normalizeLine(entry?.command);
    const id = normalizeLine(entry?.id || command);
    if (!command || !id) {
      continue;
    }

    const merged = {
      ...entry,
      id,
      command,
      source: entry.source || 'manifest',
    };

    workflows.push(merged);
    commandIndex.add(command);
    idIndex.add(id);
  }

  const detected = new Set((detectedCommands || []).map((item) => item?.command).filter(Boolean));
  for (const item of detectedCommands || []) {
    const command = normalizeLine(item?.command);
    const description = normalizeLine(item?.description) || 'CLI-discovered command.';
    const aliases = Array.isArray(item?.aliases) ? item.aliases : [];
    if (!command) {
      continue;
    }

    if (commandIndex.has(command) || idIndex.has(command)) {
      continue;
    }

    workflows.push({
      id: command,
      title: makeTitleFromCommand(command),
      command,
      description,
      aliases: aliases.filter((alias) => alias && alias !== command),
      args: [],
      source: 'cli-discovered',
      _discoveredByCli: true,
    });

    commandIndex.add(command);
    idIndex.add(command);
  }

  return workflows;
}

function validateWorkflows(workflows, detected = []) {
  const manifest = new Map((workflows || []).map((entry) => [entry.command, entry]));
  const detectedSet = new Set((detected || []).map((entry) => entry?.command || entry).filter(Boolean));
  const unknownWorkflows = [];
  const missingFromManifest = [];

  for (const key of manifest.keys()) {
    if (!detectedSet.has(key) && key !== 'menu') {
      unknownWorkflows.push(key);
    }
  }

  for (const command of detectedSet) {
    if (!manifest.has(command) && command !== 'help') {
      missingFromManifest.push(command);
    }
  }

  return {
    unknownWorkflows,
    missingFromManifest,
    detectedCount: detected.length,
    manifestCount: manifest.size,
  };
}

function updateEnvironmentDiagnostics() {
  runtimeEnvironment = gatherEnvironment();
  try {
    detectedCommandMetadata = getAvailableCommands();
    detectedCommands = (detectedCommandMetadata || []).map((entry) => entry?.command).filter(Boolean);
    WORKFLOWS = buildWorkflowCatalogFromCommands(BASE_WORKFLOWS, detectedCommandMetadata);
  } catch {
    detectedCommandMetadata = [];
    detectedCommands = [];
    WORKFLOWS = BASE_WORKFLOWS;
  }

  workflowValidation = validateWorkflows(WORKFLOWS, detectedCommands);
  runtimeDiagnostics = {
    environment: runtimeEnvironment,
    commands: detectedCommands,
    commandMetadata: detectedCommandMetadata,
    validation: workflowValidation,
    updatedAt: new Date().toISOString(),
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cca:environment', runtimeDiagnostics);
  }
}

function getPreferencesPath() {
  const base = app.getPath('userData');
  const safeRoot = path.join(base, 'clipcaptionai-desktop');
  ensureDir(safeRoot);
  return path.join(safeRoot, 'preferences.json');
}

function readPreferences() {
  const file = path.resolve(getPreferencesPath());
  const payload = readJson(file, getPreferenceSchemaDefaults());
  return normalizePreferences(payload);
}

function writePreferences(partial = {}) {
  if (!preferencesPath) {
    return;
  }

  preferences = {...preferences, ...partial};
  try {
    fs.writeFileSync(preferencesPath, `${JSON.stringify(preferences, null, 2)}\n`, 'utf8');
  } catch {
    // persistence failures should never prevent workflow execution
  }
}

function writeRunLog(session, text, channel = 'stdout') {
  if (!LOG_PATH) {
    return;
  }

  const safe = sanitizeLogText(text ?? '');
  const stamp = new Date().toISOString();
  const line = `${stamp} ${session} [${channel}] ${safe}\n`;

  try {
    ensureDir(path.dirname(LOG_PATH));
    rotateIfNeeded();
    fs.appendFileSync(LOG_PATH, line, {encoding: 'utf8'});
  } catch {
    // best-effort logging; never interrupt CLI execution for log IO failures
  }
}

function createSessionLogPath() {
  if (!app.isPackaged) {
    return path.join(PROJECT_ROOT, 'outputs', 'desktop-session.log');
  }

  return path.join(app.getPath('userData'), 'desktop-session.log');
}

function runCommand(commandWindow, session, argv, options = {}) {
  const child = spawn('node', argv, {
    cwd: PROJECT_ROOT,
    env: {...process.env, NODE_NO_WARNINGS: '1'},
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
    ...options,
  });

  const record = {
    process: child,
    session,
    command: argv.join(' '),
    startedAt: new Date().toISOString(),
    status: 'running',
    exitCode: null,
    signal: null,
    endedAt: null,
  };

  JOBS.set(session, record);

  const relay = (channel, chunk) => {
    const text = String(chunk);
    writeRunLog(session, text, channel);
    safeSend('cca:workflow-log', {
      session,
      channel,
      text,
      timestamp: new Date().toISOString(),
    });
  };

  child.stdout?.on('data', (chunk) => relay('stdout', chunk));
  child.stderr?.on('data', (chunk) => relay('stderr', chunk));
  child.on('error', (error) => {
    record.status = 'error';
    record.exitCode = 1;
    record.endedAt = new Date().toISOString();
    safeSend('cca:workflow-complete', {
      session,
      code: 1,
      signal: null,
      error: error.message,
    });
    JOBS.delete(session);
  });

  child.on('close', (code, signal) => {
    if (!record.endedAt) {
      record.status = code === 0 ? 'completed' : 'failed';
      record.exitCode = code;
      record.signal = signal;
      record.endedAt = new Date().toISOString();
    }

    safeSend('cca:workflow-complete', {
      session,
      code,
      signal,
    });
    JOBS.delete(session);
  });

  return child;
}

function killProcess(session) {
  const record = JOBS.get(session);
  if (!record) {
    return {stopped: false, reason: 'session-not-found'};
  }

  const child = record.process;
  if (child.killed) {
    JOBS.delete(session);
    return {stopped: true, reason: null};
  }

  try {
    child.kill('SIGINT');
  } catch {
    // ignore
  }

  const hardKill = () => {
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  };

  setTimeout(() => {
    hardKill();
    setTimeout(() => {
      if (!child.killed) {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }, 800);
  }, 900);

  return {stopped: true, reason: null};
}

function createWindow() {
  const bounds = (preferences?.windowBounds && {
    width: preferences.windowBounds.width || DEFAULT_WINDOW_SETTINGS.width,
    height: preferences.windowBounds.height || DEFAULT_WINDOW_SETTINGS.height,
    x: preferences.windowBounds.x,
    y: preferences.windowBounds.y,
  }) || DEFAULT_WINDOW_SETTINGS;

  const window = new BrowserWindow({
    title: APP_NAME,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    backgroundColor: '#0e1024',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.loadFile(path.join(__dirname, 'index.html'));
  window.once('ready-to-show', () => window.show());

  window.webContents.on('did-fail-load', (_event, code, desc) => {
    console.error(`Renderer failed to load: ${code} ${desc}`);
  });

  window.on('moved', () => {
    const bounds = window.getBounds();
    writePreferences({windowBounds: bounds});
  });

  window.on('resized', () => {
    const bounds = window.getBounds();
    writePreferences({windowBounds: bounds});
  });

  return window;
}

function getPreferenceSchemaDefaults() {
  return {
    version: PREFS_VERSION,
    windowBounds: DEFAULT_WINDOW_BOUNDS,
    lastWorkflowId: 'moments',
    lastRawCommand: '',
    runnerMode: 'form',
    lastExtraArgs: '',
    formDrafts: {},
  };
}

function normalizePreferences(raw = {}) {
  const defaults = getPreferenceSchemaDefaults();
  const merged = {...defaults, ...(raw || {})};
  const normalized = {...defaults, ...merged};

  if (typeof normalized.windowBounds !== 'object' || normalized.windowBounds === null) {
    normalized.windowBounds = defaults.windowBounds;
  }

  normalized.windowBounds = {
    ...defaults.windowBounds,
    ...normalized.windowBounds,
  };

  if (typeof normalized.formDrafts !== 'object' || normalized.formDrafts === null || Array.isArray(normalized.formDrafts)) {
    normalized.formDrafts = {};
  }

  if (!Number.isFinite(normalized.version) || normalized.version < 1) {
    normalized.version = PREFS_VERSION;
  }

  return normalized;
}

function persistWorkflowDraft(workflowId, argName, value) {
  const safe = preferences.formDrafts || {};
  const workflowDrafts = safe[workflowId] || {};
  safe[workflowId] = {...workflowDrafts, [argName]: value};
  writePreferences({formDrafts: safe});
}

function setPreferenceValue(key, value) {
  if (typeof key !== 'string') {
    return;
  }

  if (key.startsWith('form:')) {
    const pieces = key.split(':');
    const workflowId = pieces[1];
    const argName = pieces[2];
    if (workflowId && argName) {
      persistWorkflowDraft(workflowId, argName, value);
    }

    return;
  }

  if (!Object.hasOwn(preferences, key)) {
    return;
  }

  if (key === 'version') {
    return;
  }

  writePreferences({[key]: value});
}

function getFormDraftsForWorkflow(workflowId) {
  return {...((preferences?.formDrafts || {})[workflowId] || {})};
}

function installIpcHandlers() {
  if (ipcHandlersInstalled) {
    return;
  }

  ipcMain.handle('cca:get-environment', () => runtimeDiagnostics ?? runtimeEnvironment);

  ipcMain.handle('cca:list-workflows', () => ({
    workflows: WORKFLOWS,
    environment: runtimeEnvironment,
    detectedCommands: detectedCommands,
    commandMetadata: detectedCommandMetadata,
    validation: workflowValidation,
    generatedAt: runtimeDiagnostics?.updatedAt,
  }));

  ipcMain.handle('cca:get-preferences', () => preferences);

  ipcMain.handle('cca:set-preference', (_event, payload) => {
    if (!payload || typeof payload !== 'object') {
      return preferences;
    }

    const {key, value} = payload;
    if (typeof key !== 'string' || key.trim().length === 0) {
      return preferences;
    }

    setPreferenceValue(key, value);
    return preferences;
  });

  ipcMain.handle('cca:project-root', () => PROJECT_ROOT);

  ipcMain.handle('cca:pick-path', async (_event, payload = {}) => {
    const options = {
      properties: payload.directories ? ['openDirectory'] : ['openFile'],
      defaultPath: payload.defaultPath ?? PROJECT_ROOT,
      title: payload.title ?? 'Select path',
      buttonLabel: payload.buttonLabel ?? 'Select',
    };

    const result = await dialog.showOpenDialog(mainWindow, options);
    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    };
  });

  ipcMain.handle('cca:open-path', (_event, targetPath) => {
    if (!targetPath) {
      return {opened: false};
    }
    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) {
      return {opened: false, error: 'Path does not exist.', path: resolved};
    }

    return shell.openPath(resolved).then((err) => {
      if (err) {
        return {opened: false, error: err, path: resolved};
      }

      return {opened: true, path: resolved};
    });
  });

  ipcMain.handle('cca:log-path', () => LOG_PATH);

  ipcMain.handle('cca:run-workflow', async (_event, payload = {}) => {
    if (!mainWindow) {
      throw new Error('Main window not available');
    }

    if (JOBS.size > 0) {
      throw new Error('A workflow is already running. Stop it before starting another.');
    }

    const workflow = WORKFLOWS.find((candidate) => candidate.id === payload.workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflow: ${payload.workflowId}`);
    }

    const normalizedCommand = String(workflow.command || '').trim();
    if (!normalizedCommand) {
      throw new Error(`Workflow '${payload.workflowId}' is missing command metadata.`);
    }

    if (runtimeDiagnostics?.environment?.passed && runtimeDiagnostics?.commands?.length) {
      if (!runtimeDiagnostics.commands.includes(normalizedCommand) && normalizedCommand !== 'menu') {
        throw new Error(`CLI command not available right now: ${normalizedCommand}`);
      }
    }

    const argv = buildArgvFromInput(workflow.command, payload.argValues || {}, payload.extraArgs || '');
    const session = crypto.randomUUID();
    runCommand(mainWindow, session, argv);
    writePreferences({lastWorkflowId: workflow.id});
    return {
      session,
      command: `node ${argv.join(' ')}`,
      startedAt: new Date().toISOString(),
    };
  });

  ipcMain.handle('cca:run-raw-command', async (_event, payload = {}) => {
    if (!mainWindow) {
      throw new Error('Main window not available');
    }

    if (JOBS.size > 0) {
      throw new Error('A workflow is already running. Stop it before starting another.');
    }

    const command = normalizeLine(payload.command ?? '');
    if (!command) {
      throw new Error('No command provided.');
    }

    const argv = [CLI_ENTRY, ...sanitizeRawTokens(command)];
    if (argv.length <= 1) {
      throw new Error('No command was detected after sanitizing input.');
    }
    if (!argv[1] || argv[1].startsWith('-')) {
      throw new Error('Raw command must start with a CLI command name.');
    }

    const session = crypto.randomUUID();
    runCommand(mainWindow, session, argv);
    writePreferences({lastRawCommand: command});
    return {
      session,
      command: `node ${argv.join(' ')}`,
      startedAt: new Date().toISOString(),
    };
  });

  ipcMain.handle('cca:stop-workflow', (_event, session) => {
    const target = session || [...JOBS.keys()][0];
    return killProcess(target);
  });

  ipcHandlersInstalled = true;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  preferencesPath = getPreferencesPath();
  preferences = readPreferences();
  LOG_PATH = createSessionLogPath();
  ensureDir(path.dirname(LOG_PATH));
  runtimeDiagnostics = null;

  writeRunLog('startup', `Starting ${APP_NAME}`, 'system');
  updateEnvironmentDiagnostics();
  mainWindow = createWindow();
  installIpcHandlers();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('ready-to-show', () => {
    if (process.env.CCA_DESKTOP_DEV === '1') {
      mainWindow.webContents.openDevTools({mode: 'right'});
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (runtimeDiagnostics) {
      safeSend('cca:environment', runtimeDiagnostics);
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
    installIpcHandlers();
  }
});

app.on('before-quit', () => {
  for (const session of JOBS.keys()) {
    killProcess(session);
  }
});
