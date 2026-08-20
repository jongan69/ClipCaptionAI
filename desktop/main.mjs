#!/usr/bin/env node
import {app, BrowserWindow, dialog, ipcMain, Menu, shell} from 'electron';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {commandExists} from '../scripts/command-utils.mjs';
import {outputsRoot as DESKTOP_OUTPUTS_ROOT, probeVideo} from '../scripts/lib.mjs';
import {SecretVault} from './shared/env.mjs';
import {resolveRuntimePaths, ensureRuntimeDirs} from './shared/paths.mjs';
import {CHANNELS, EVENTS, validateRunRequest, validateSecretKey} from './shared/protocol.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_PROJECT_ROOT = path.resolve(__dirname, '..');
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

process.on('uncaughtException', (error) => {
  console.error('[main] Uncaught exception:', error);
  writeRunLog('main', `Uncaught exception: ${error?.stack || error?.message || error}`, 'error');
});

process.on('unhandledRejection', (reason) => {
  console.error('[main] Unhandled rejection:', reason);
  writeRunLog(
    'main',
    `Unhandled rejection: ${reason?.stack || reason?.message || reason}`,
    'error',
  );
});

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
let secretVault = null;
let runtimePaths = null;

/**
 * Root of the CLI tree available to spawned `node` children.
 *
 * In dev this is the repository root. In packaged builds children cannot
 * read through the asar, so this resolves to the unpacked tree (see
 * asarUnpack in package.json and desktop/shared/paths.mjs).
 */
function getCliRoot() {
  return runtimePaths?.projectRoot || DEV_PROJECT_ROOT;
}

function getCliEntry() {
  return path.join(getCliRoot(), 'bin', 'clipcaptionai.js');
}

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
    .replace(
      /\b(OPENAI_API_KEY|DEEPSEEK_API_KEY|YOUTUBE_API_KEY|FAL_KEY|ELEVENLABS_API_KEY|ELEVENLABS_VOICE_ID|EBAY_MCP_TOKEN)=([^\s"']+)/gi,
      '$1=[redacted]',
    )
    .replace(/(--api-key)\s+([^\s"']+)/gi, '$1 [redacted]')
    .replace(/\r?\n/g, ' ');
}

function assertTrustedSender(event) {
  if (!event || !mainWindow || mainWindow.isDestroyed()) {
    throw new Error('No main window available.');
  }

  const trusted =
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame;
  if (!trusted) {
    throw new Error('Rejected IPC call from an untrusted frame.');
  }
}

function getAllowedCommandNames() {
  const allowed = new Set(['menu', 'help', 'doctor']);
  for (const workflow of WORKFLOWS || []) {
    if (workflow.command) {
      allowed.add(workflow.command);
    }

    for (const alias of workflow.aliases || []) {
      if (alias) {
        allowed.add(alias);
      }
    }
  }

  for (const command of detectedCommands || []) {
    if (command) {
      allowed.add(command);
    }
  }

  return allowed;
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
      ['npx', 'node', 'clipcaptionai', 'npm'].includes(token) ||
      /(.*\/)?clipcaptionai\.js$/.test(token) ||
      /(.*\/)?clipkit\.mjs$/.test(token)
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
  const argv = [getCliEntry(), command];
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
    projectRoot: getCliRoot(),
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
    path.join(getCliRoot(), 'bin', 'clipcaptionai.js'),
    path.join(getCliRoot(), 'scripts', 'clipkit.mjs'),
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

    if (!/^ {2}/.test(line)) {
      break;
    }

    const match = line.match(/^ {2}([a-zA-Z0-9-_|]+)\s{2,}(.*)$/);
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
  const result = spawnSync('node', [getCliEntry(), ...CLIPKIT_HELP_COMMAND], {
    cwd: getCliRoot(),
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
  const detectedSet = new Set(
    (detected || []).map((entry) => entry?.command || entry).filter(Boolean),
  );
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
    detectedCommands = (detectedCommandMetadata || [])
      .map((entry) => entry?.command)
      .filter(Boolean);
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
    mainWindow.webContents.send(EVENTS.ENVIRONMENT, runtimeDiagnostics);
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
    fs.writeFileSync(preferencesPath, `${JSON.stringify(preferences, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    // mode only applies at creation; enforce it for existing files too.
    fs.chmodSync(preferencesPath, 0o600);
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
    return path.join(DESKTOP_OUTPUTS_ROOT, 'desktop-session.log');
  }

  return path.join(app.getPath('userData'), 'desktop-session.log');
}

function runCommand(commandWindow, session, argv, options = {}) {
  const child = spawn('node', argv, {
    cwd: getCliRoot(),
    env: {
      ...process.env,
      // Secrets saved in the UI must reach CLI children without an app restart.
      ...(secretVault ? secretVault.getAll() : {}),
      NODE_NO_WARNINGS: '1',
    },
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
    safeSend(EVENTS.WORKFLOW_LOG, {
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
    safeSend(EVENTS.WORKFLOW_COMPLETE, {
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

    safeSend(EVENTS.WORKFLOW_COMPLETE, {
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
  const bounds =
    (preferences?.windowBounds && {
      width: preferences.windowBounds.width || DEFAULT_WINDOW_SETTINGS.width,
      height: preferences.windowBounds.height || DEFAULT_WINDOW_SETTINGS.height,
      x: preferences.windowBounds.x,
      y: preferences.windowBounds.y,
    }) ||
    DEFAULT_WINDOW_SETTINGS;

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
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Dev: load from Vite dev server; Prod: load built React app
  if (process.env.CCA_DESKTOP_DEV === '1') {
    const VITE_DEV_PORT = process.env.CCA_VITE_PORT || 5173;
    window.loadURL(`http://localhost:${VITE_DEV_PORT}`);
  } else if (fs.existsSync(path.join(__dirname, 'dist-renderer', 'index.html'))) {
    window.loadFile(path.join(__dirname, 'dist-renderer', 'index.html'));
  } else {
    // Fallback: legacy renderer
    window.loadFile(path.join(__dirname, 'index.html'));
  }

  window.once('ready-to-show', () => window.show());

  // ── Navigation lockdown ─────────────────────────────────────
  // The renderer is granted a privileged IPC bridge; never allow it to
  // navigate anywhere except the dev server it was loaded from. Otherwise
  // a link click or post-XSS navigation would attach the bridge to
  // attacker-controlled content.
  const devOrigin = `http://localhost:${process.env.CCA_VITE_PORT || 5173}`;

  window.webContents.on('will-navigate', (event, url) => {
    const isDevNavigation = process.env.CCA_DESKTOP_DEV === '1' && url.startsWith(devOrigin);
    if (!isDevNavigation) {
      event.preventDefault();
    }
  });

  window.webContents.setWindowOpenHandler(({url}) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }

    return {action: 'deny'};
  });

  window.webContents.on('did-fail-load', (_event, code, desc) => {
    console.error(`Renderer failed to load: ${code} ${desc}`);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`Renderer process gone: ${details.reason} (exit code ${details.exitCode})`);
  });

  window.webContents.on('did-finish-load', () => {
    if (runtimeDiagnostics) {
      safeSend(EVENTS.ENVIRONMENT, runtimeDiagnostics);
    }
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

  if (
    typeof normalized.formDrafts !== 'object' ||
    normalized.formDrafts === null ||
    Array.isArray(normalized.formDrafts)
  ) {
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

function installIpcHandlers() {
  if (ipcHandlersInstalled) {
    return;
  }

  // Every handler validates its sender: only the main frame of the main
  // window may use this bridge. This is the defense-in-depth layer that
  // backs the navigation lockdown in createWindow.
  ipcMain.handle(CHANNELS.GET_ENVIRONMENT, (event) => {
    assertTrustedSender(event);
    return runtimeDiagnostics ?? runtimeEnvironment;
  });

  ipcMain.handle(CHANNELS.LIST_WORKFLOWS, (event) => {
    assertTrustedSender(event);
    return {
      workflows: WORKFLOWS,
      environment: runtimeEnvironment,
      detectedCommands: detectedCommands,
      commandMetadata: detectedCommandMetadata,
      validation: workflowValidation,
      generatedAt: runtimeDiagnostics?.updatedAt,
    };
  });

  ipcMain.handle(CHANNELS.GET_PREFERENCES, (event) => {
    assertTrustedSender(event);
    return preferences;
  });

  ipcMain.handle(CHANNELS.SET_PREFERENCE, (event, payload) => {
    assertTrustedSender(event);
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

  ipcMain.handle(CHANNELS.PROJECT_ROOT, (event) => {
    assertTrustedSender(event);
    return getCliRoot();
  });

  ipcMain.handle(CHANNELS.PICK_PATH, async (event, payload = {}) => {
    assertTrustedSender(event);
    const options = {
      properties: payload.directories ? ['openDirectory'] : ['openFile'],
      defaultPath: payload.defaultPath ?? getCliRoot(),
      title: payload.title ?? 'Select path',
      buttonLabel: payload.buttonLabel ?? 'Select',
    };

    const result = await dialog.showOpenDialog(mainWindow, options);
    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    };
  });

  ipcMain.handle(CHANNELS.OPEN_PATH, (event, targetPath) => {
    assertTrustedSender(event);
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

  ipcMain.handle(CHANNELS.LOG_PATH, (event) => {
    assertTrustedSender(event);
    return LOG_PATH;
  });

  ipcMain.handle(CHANNELS.RUN_WORKFLOW, async (event, rawPayload = {}) => {
    assertTrustedSender(event);
    const payload = validateRunRequest(rawPayload);

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
      if (
        !runtimeDiagnostics.commands.includes(normalizedCommand) &&
        normalizedCommand !== 'menu'
      ) {
        throw new Error(`CLI command not available right now: ${normalizedCommand}`);
      }
    }

    const argv = buildArgvFromInput(workflow.command, payload.argValues, payload.extraArgs);
    const session = crypto.randomUUID();
    runCommand(mainWindow, session, argv);
    writePreferences({lastWorkflowId: workflow.id});
    return {
      session,
      command: `node ${argv.join(' ')}`,
      startedAt: new Date().toISOString(),
    };
  });

  ipcMain.handle(CHANNELS.RUN_RAW_COMMAND, async (event, payload = {}) => {
    assertTrustedSender(event);

    if (JOBS.size > 0) {
      throw new Error('A workflow is already running. Stop it before starting another.');
    }

    const command = normalizeLine(payload.command ?? '');
    if (!command) {
      throw new Error('No command provided.');
    }

    const argv = [getCliEntry(), ...sanitizeRawTokens(command)];
    if (argv.length <= 1) {
      throw new Error('No command was detected after sanitizing input.');
    }
    if (!argv[1] || argv[1].startsWith('-')) {
      throw new Error('Raw command must start with a CLI command name.');
    }

    // Raw commands may only target commands that exist in the CLI catalog —
    // anything else is rejected rather than passed to a shell.
    const allowedCommands = getAllowedCommandNames();
    if (!allowedCommands.has(argv[1])) {
      throw new Error(`Command not available in the desktop app: ${argv[1]}`);
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

  ipcMain.handle(CHANNELS.STOP_WORKFLOW, (event, session) => {
    assertTrustedSender(event);
    const target = session || [...JOBS.keys()][0];
    return killProcess(target);
  });

  // ── Secrets management ──────────────────────────────────────
  ipcMain.handle(CHANNELS.GET_SECRET_STATE, (event) => {
    assertTrustedSender(event);
    return secretVault ? secretVault.getPresence() : {};
  });

  ipcMain.handle(CHANNELS.SET_SECRET, (event, {key, value} = {}) => {
    assertTrustedSender(event);
    // Only known env keys may be stored — anything else would be injected
    // into every spawned CLI process and is an arbitrary-code-execution path.
    validateSecretKey(key);
    if (secretVault) {
      secretVault.set(key, value);
    }

    return secretVault ? secretVault.getPresence() : {};
  });

  ipcMain.handle(CHANNELS.CLEAR_SECRET, (event, {key} = {}) => {
    assertTrustedSender(event);
    validateSecretKey(key);
    if (secretVault) {
      secretVault.clear(key);
    }

    return secretVault ? secretVault.getPresence() : {};
  });

  // ── Path info ───────────────────────────────────────────────
  ipcMain.handle(CHANNELS.GET_PATHS, (event) => {
    assertTrustedSender(event);
    if (!runtimePaths) return {};
    return {
      projectRoot: runtimePaths.projectRoot,
      outputsRoot: runtimePaths.outputsRoot,
      userDataRoot: runtimePaths.userDataRoot,
      configRoot: runtimePaths.configRoot,
    };
  });

  // ── Output listing ──────────────────────────────────────────
  ipcMain.handle(CHANNELS.LIST_OUTPUTS, (event) => {
    assertTrustedSender(event);
    const outDir = runtimePaths?.outputsRoot || DESKTOP_OUTPUTS_ROOT;
    try {
      const entries = fs
        .readdirSync(outDir, {withFileTypes: true})
        .filter((d) => d.isDirectory())
        .map((d) => {
          const fullPath = path.join(outDir, d.name);
          const stat = fs.statSync(fullPath);
          return {
            name: d.name,
            path: fullPath,
            type: d.name.includes('caption')
              ? 'captioned'
              : d.name.includes('chapter')
                ? 'chapters'
                : d.name.includes('tighten')
                  ? 'tightened'
                  : d.name.includes('run')
                    ? 'run'
                    : 'other',
            date: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 50);
      return entries;
    } catch {
      return [];
    }
  });

  // ── Video probing (read-only ffprobe) ───────────────────────
  ipcMain.handle(CHANNELS.PROBE_VIDEO, (event, videoPath) => {
    assertTrustedSender(event);
    if (typeof videoPath !== 'string' || !videoPath) {
      throw new Error('A video path is required.');
    }

    const resolved = path.resolve(videoPath);
    if (!fs.existsSync(resolved)) {
      throw new Error('File does not exist.');
    }

    return probeVideo(resolved);
  });

  // ── Project file I/O (allowlist only) ───────────────────────
  ipcMain.handle(CHANNELS.READ_PROJECT_FILE, (event, name) => {
    assertTrustedSender(event);
    const allowed = [
      'links.txt',
      'broll-prompts.txt',
      'caption-style.json',
      'interview-qa-output.json',
    ];
    const base = name?.split('/')?.pop() || '';
    if (!allowed.includes(base)) {
      throw new Error(
        `Reading "${base}" is not allowed. Use links.txt, broll-prompts.txt, or caption-style.json.`,
      );
    }
    const filePath = path.join(runtimePaths?.configRoot || getCliRoot(), base);
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  });

  ipcMain.handle(CHANNELS.WRITE_PROJECT_FILE, (event, {name, content}) => {
    assertTrustedSender(event);
    const allowed = ['links.txt', 'broll-prompts.txt'];
    const base = name?.split('/')?.pop() || '';
    if (!allowed.includes(base)) {
      throw new Error(`Writing "${base}" is not allowed.`);
    }
    const targetDir = runtimePaths?.configRoot || getCliRoot();
    ensureDir(targetDir);
    fs.writeFileSync(path.join(targetDir, base), String(content), 'utf8');
    return {ok: true};
  });

  // ── Cleanup ─────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.CLEANUP, (event, {scope}) => {
    assertTrustedSender(event);
    const outDir = runtimePaths?.outputsRoot || DESKTOP_OUTPUTS_ROOT;
    const workDir = runtimePaths?.workRoot || path.join(outDir, 'work');
    const mediaDir = runtimePaths?.publicMediaRoot || path.join(getCliRoot(), 'public', 'media');

    const cleaned = [];
    try {
      if (scope === 'temp' || scope === 'all') {
        if (fs.existsSync(workDir)) {
          fs.rmSync(workDir, {recursive: true, force: true});
          cleaned.push('temp');
        }
      }
      if (scope === 'media-staging' || scope === 'all') {
        if (fs.existsSync(mediaDir)) {
          const files = fs.readdirSync(mediaDir);
          for (const f of files) {
            fs.unlinkSync(path.join(mediaDir, f));
          }
          cleaned.push('media-staging');
        }
      }
      if (scope === 'old-outputs' || scope === 'all') {
        if (fs.existsSync(outDir)) {
          const dirs = fs
            .readdirSync(outDir, {withFileTypes: true})
            .filter((d) => d.isDirectory())
            .map((d) => ({name: d.name, path: path.join(outDir, d.name)}))
            .sort((a, b) => {
              const sa = fs.statSync(a.path);
              const sb = fs.statSync(b.path);
              return sb.mtimeMs - sa.mtimeMs;
            });
          // Keep last 5, remove rest
          for (const d of dirs.slice(5)) {
            fs.rmSync(d.path, {recursive: true, force: true});
          }
          cleaned.push(`old-outputs (kept ${Math.min(5, dirs.length)})`);
        }
      }
    } catch (e) {
      return {ok: false, error: e.message, cleaned};
    }
    return {ok: true, cleaned};
  });

  ipcHandlersInstalled = true;
}

app.whenReady().then(() => {
  // A second instance lost the single-instance lock — exit before
  // creating windows or spawning anything.
  if (!gotSingleInstance) {
    return;
  }

  Menu.setApplicationMenu(null);

  // ── Initialize paths & vault ─────────────────────────────────
  runtimePaths = resolveRuntimePaths();
  ensureRuntimeDirs(runtimePaths);

  // Override lib.mjs paths for any in-process module usage
  process.env.CCA_ELECTRON = '1';
  process.env.CCA_PROJECT_ROOT = runtimePaths.projectRoot;
  process.env.CCA_OUTPUTS_ROOT = runtimePaths.outputsRoot;
  process.env.CCA_PUBLIC_MEDIA_ROOT = runtimePaths.publicMediaRoot;

  secretVault = new SecretVault(runtimePaths.secretsPath);
  secretVault.load();
  // Inject secrets into process.env so ai-provider.mjs works
  secretVault.injectIntoEnv(process.env);

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
});

app.on('window-all-closed', () => {
  // macOS convention: keep the app alive when the window closes.
  if (process.platform !== 'darwin') {
    app.quit();
  }
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
