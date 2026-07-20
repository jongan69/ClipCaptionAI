const workflowListEl = document.getElementById('workflow-list');
const selectedTitleEl = document.getElementById('selected-title');
const selectedCommandEl = document.getElementById('selected-command');
const selectedDescriptionEl = document.getElementById('selected-description');
const workflowFieldsEl = document.getElementById('workflow-fields');
const extraArgsEl = document.getElementById('extra-args');
const runWorkflowBtn = document.getElementById('run-workflow-btn');
const stopWorkflowBtn = document.getElementById('stop-workflow-btn');
const openWorkdirBtn = document.getElementById('open-workdir-btn');
const openLogBtn = document.getElementById('open-log-btn');
const statusEl = document.getElementById('status');
const environmentStatusEl = document.getElementById('environment-status');
const workflowFormEl = document.getElementById('workflow-form');
const rawCommandEl = document.getElementById('raw-command');
const rawRunBtn = document.getElementById('run-raw-btn');
const openOutputsBtn = document.getElementById('open-outputs-btn');
const runLogEl = document.getElementById('run-log');

let workflows = [];
let currentWorkflow = null;
let currentSession = null;
let environment = null;
let validation = null;
let preferences = null;
let canRun = false;

const setRunControls = () => {
  const envReady = environment?.passed !== false;
  const controlsReady = envReady && canRun;
  runWorkflowBtn.disabled = !controlsReady || !!currentSession;
  rawRunBtn.disabled = !controlsReady || !!currentSession;
  stopWorkflowBtn.disabled = !currentSession;
  openOutputsBtn.disabled = !environment;
  openWorkdirBtn.disabled = false;
  openLogBtn.disabled = false;
};

const renderEnvStatus = () => {
  if (!environment) {
    environmentStatusEl.textContent = 'Environment check pending...';
    canRun = false;
    return;
  }

  if (!environment.passed) {
    const required = (environment.required || []).join(', ');
    const files = (environment.files || []).length > 0 ? ` Missing files: ${environment.files.length}` : '';
    environmentStatusEl.textContent = `Environment check failed. Missing: ${required}. ${files}`.trim();
    statusEl.textContent = 'Environment missing required dependencies.';
    statusEl.className = 'status error';
    canRun = false;
    setRunControls();
    return;
  }

  const optional = (environment.optional || []);
  if (optional.length > 0) {
    environmentStatusEl.textContent = `Environment healthy. Optional tools missing: ${optional.join(', ')}.`;
    canRun = true;
    setRunControls();
    return;
  }

  environmentStatusEl.textContent = 'Environment healthy. Ready for workflows.';
  canRun = true;
  setRunControls();
};

const renderWorkflowValidation = () => {
  if (!validation) {
    return;
  }

  const missingFromManifest = validation.missingFromManifest || [];
  const unknownWorkflows = validation.unknownWorkflows || [];
  if (missingFromManifest.length === 0 && unknownWorkflows.length === 0) {
    return;
  }

  const lines = [];
  if (missingFromManifest.length > 0) {
    lines.push(`New CLI commands not represented in UI: ${missingFromManifest.join(', ')}`);
  }

  if (unknownWorkflows.length > 0) {
    lines.push(`UI has commands not in current CLI help: ${unknownWorkflows.join(', ')}`);
  }

  const baseStatus = (environmentStatusEl.textContent || '').split(' New CLI commands')[0].trim();
  environmentStatusEl.textContent = `${baseStatus} ${lines.join(' ')}`.trim();
};

const renderArgInput = (arg) => {
  const wrapper = document.createElement('label');
  wrapper.className = `field ${arg.type === 'textarea' ? 'full' : ''}`;

  const label = document.createElement('small');
  label.textContent = `${arg.label}${arg.required ? ' *' : ''}`;
  wrapper.appendChild(label);

  let input = null;
  if (arg.type === 'select') {
    input = document.createElement('select');
    input.dataset.argName = arg.name;
    input.className = 'field-input';
    for (const option of arg.options || []) {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      if (arg.value !== undefined && arg.value === option.value) {
        item.selected = true;
      }
      input.appendChild(item);
    }
  } else if (arg.type === 'boolean') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.argName = arg.name;
    input.checked = Boolean(arg.value);
  } else {
    input = document.createElement('input');
    input.type = arg.type === 'number' ? 'number' : 'text';
    input.dataset.argName = arg.name;
    input.placeholder = arg.placeholder || '';
    input.className = 'field-input';
    if (arg.required) {
      input.required = true;
    }
    if (arg.value !== undefined && arg.type !== 'boolean') {
      input.value = String(arg.value);
    }
  }

  wrapper.appendChild(input);
  return wrapper;
};

const setStatus = (message, type = '') => {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
};

const appendLog = (payload) => {
  runLogEl.dataset.empty = 'false';
  const line = document.createElement('span');
  line.textContent = `[${payload.timestamp || new Date().toISOString()}][${payload.session}][${payload.channel}] ${payload.text}`;
  if (payload.channel === 'stderr') {
    line.style.color = '#ffb9c5';
  }

  runLogEl.appendChild(line);
  runLogEl.appendChild(document.createElement('br'));
  runLogEl.scrollTop = runLogEl.scrollHeight;
};

const clearLog = () => {
  runLogEl.textContent = '';
  runLogEl.dataset.empty = 'true';
};

const collectFormValues = () => {
  const args = {};
  const nodes = workflowFieldsEl.querySelectorAll('[data-arg-name]');
  nodes.forEach((node) => {
    const key = node.dataset.argName;
    if (node.type === 'checkbox') {
      args[key] = node.checked;
      return;
    }

    const value = (node.value ?? '').trim();
    if (value !== '') {
      args[key] = value;
    }
  });

  return args;
};

const selectWorkflow = (workflow, shouldPersist = true) => {
  currentWorkflow = workflow;
  selectedTitleEl.textContent = workflow.title;
  selectedCommandEl.textContent = `clipcaptionai ${workflow.command}`;
  selectedDescriptionEl.textContent = workflow.description;
  workflowFieldsEl.innerHTML = '';

  for (const arg of workflow.args || []) {
    workflowFieldsEl.appendChild(renderArgInput(arg));
  }

  const workflowDrafts = preferences?.formDrafts?.[workflow.id] || {};
  workflowFieldsEl.querySelectorAll('[data-arg-name]').forEach((field) => {
    const argName = field.dataset.argName;
    if (!(argName in workflowDrafts)) {
      return;
    }

    const saved = workflowDrafts[argName];
    if (field.type === 'checkbox') {
      field.checked = Boolean(saved);
      return;
    }

    if (saved === null || saved === undefined) {
      field.value = '';
      return;
    }

    field.value = String(saved);
  });

  if (shouldPersist) {
    window.cca.setPreference('lastWorkflowId', workflow.id);
    window.cca.setPreference('runnerMode', 'form');
  }

  extraArgsEl.value = '';
  setRunControls();
};

const stopRunning = async () => {
  if (!currentSession) {
    return;
  }

  setStatus('Stop requested…', 'status');
  await window.cca.stopWorkflow(currentSession);
};

const runWorkflow = async () => {
  if (!canRun) {
    setStatus('Environment is not ready for workflow execution.', 'error');
    return;
  }

  if (!currentWorkflow) {
    return;
  }

  if (workflowFormEl) {
    if (!workflowFormEl.reportValidity()) {
      return;
    }
  }

  if (currentSession) {
    setStatus('A command is already running.', 'error');
    return;
  }

  const argValues = collectFormValues();
  const payload = {
    workflowId: currentWorkflow.id,
    argValues,
    extraArgs: extraArgsEl.value.trim(),
  };

  clearLog();
  setStatus(`Starting workflow: ${currentWorkflow.command}`, 'running');
  runWorkflowBtn.disabled = true;
  rawRunBtn.disabled = true;
  stopWorkflowBtn.disabled = false;

  try {
    const result = await window.cca.runWorkflow(payload);
    currentSession = result.session;
    setRunControls();
    setStatus(`Running session ${currentSession}`, 'running');
    window.cca.setPreference('lastExtraArgs', payload.extraArgs);
  } catch (error) {
    currentSession = null;
    setRunControls();
    setStatus(error?.message || String(error), 'error');
  }
};

const runRaw = async () => {
  if (!canRun) {
    setStatus('Environment is not ready for workflow execution.', 'error');
    return;
  }

  const command = rawCommandEl.value.trim();
  if (!command) {
    setStatus('Type a raw command first.', 'error');
    return;
  }

  if (currentSession) {
    setStatus('A command is already running.', 'error');
    return;
  }

  clearLog();
  setStatus(`Running: clipcaptionai ${command}`, 'running');
  runWorkflowBtn.disabled = true;
  rawRunBtn.disabled = true;
  stopWorkflowBtn.disabled = false;
  window.cca.setPreference('runnerMode', 'raw');
  window.cca.setPreference('lastRawCommand', command);

  try {
    const result = await window.cca.runRawCommand({command});
    currentSession = result.session;
    setRunControls();
    setStatus(`Running session ${currentSession}`, 'running');
  } catch (error) {
    currentSession = null;
    setRunControls();
    setStatus(error?.message || String(error), 'error');
  }
};

const openRoot = async () => {
  const root = await window.cca.projectRoot();
  const result = await window.cca.openPath(root);
  if (!result?.opened) {
    setStatus(result?.error || `Could not open ${root}`, 'error');
  }
};

const openOutputs = async () => {
  const root = await window.cca.projectRoot();
  const result = await window.cca.openPath(`${root}/outputs`);
  if (!result?.opened) {
    setStatus(result?.error || `Could not open ${root}/outputs`, 'error');
  }
};

const openSessionLog = async () => {
  const logPath = await window.cca.getLogPath();
  if (!logPath) {
    setStatus('Session log path is not available yet.', 'error');
    return;
  }

  const result = await window.cca.openPath(logPath);
  if (!result?.opened) {
    setStatus(result?.error || `Could not open ${logPath}`, 'error');
  }
};

const onComplete = (payload) => {
  runLogEl.dataset.empty = runLogEl.childElementCount === 0 ? 'true' : 'false';
  if (currentSession !== payload.session) {
    return;
  }

  const {code, error} = payload;
  if (error || code !== 0) {
    setStatus(`Exited (${code ?? 'error'}) ${error ? `- ${error}` : ''}`.trim(), 'error');
  } else {
    setStatus(`Completed (${code})`, 'good');
  }

  currentSession = null;
  setRunControls();
};

const hydrateWorkflows = async () => {
  const payload = await window.cca.listWorkflows();
  workflows = payload.workflows || [];
  environment = payload.environment || null;
  validation = payload.validation || null;

  workflowListEl.innerHTML = '';
  workflows.forEach((workflow, index) => {
    const item = document.createElement('button');
    item.className = 'workflow';
    item.type = 'button';

    const title = document.createElement('strong');
    title.textContent = workflow.title;

    const summary = document.createElement('small');
    summary.textContent = workflow.command;

    item.appendChild(title);
    item.appendChild(summary);
    item.addEventListener('click', () => {
      document.querySelectorAll('.workflow').forEach((entry) => {
        entry.classList.remove('active');
      });
      item.classList.add('active');
      selectWorkflow(workflow);
    });

    workflowListEl.appendChild(item);

    if (workflow.id === (preferences?.lastWorkflowId)) {
      item.classList.add('active');
      selectWorkflow(workflow, false);
      return;
    }

    if (!preferences?.lastWorkflowId && index === 0) {
      item.classList.add('active');
      selectWorkflow(workflow, false);
    }
  });
};

const hydratePreferences = async () => {
  preferences = await window.cca.getPreferences();
  if (!preferences) {
    return;
  }

  if (preferences?.lastRawCommand) {
    rawCommandEl.value = preferences.lastRawCommand;
  }

  if (preferences?.lastExtraArgs) {
    extraArgsEl.value = preferences.lastExtraArgs;
  }

  if (preferences?.runnerMode === 'raw') {
    setStatus('Raw mode was used last. Select a workflow to switch.', 'status');
  }
};

const onEnvironmentChanged = (payload) => {
  if (!payload) {
    return;
  }
  environment = payload.environment || environment;
  validation = payload.validation || validation;
  renderEnvStatus();
  renderWorkflowValidation();
  setRunControls();
};

const init = async () => {
  await hydrateWorkflows();
  renderEnvStatus();
  renderWorkflowValidation();
  await hydratePreferences();

  workflowFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    runWorkflow();
  });

  runWorkflowBtn.addEventListener('click', runWorkflow);
  stopWorkflowBtn.addEventListener('click', stopRunning);
  openWorkdirBtn.addEventListener('click', openRoot);
  rawRunBtn.addEventListener('click', runRaw);
  openOutputsBtn.addEventListener('click', openOutputs);
  openLogBtn.addEventListener('click', openSessionLog);

  workflowFieldsEl.addEventListener('input', (event) => {
    if (event.target?.dataset?.argName) {
      const key = event.target.dataset.argName;
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      window.cca.setPreference(`form:${currentWorkflow?.id}:${key}`, value);
    }
  });

  extraArgsEl.addEventListener('input', () => {
    window.cca.setPreference('lastExtraArgs', extraArgsEl.value);
  });

  window.cca.onLog(appendLog);
  window.cca.onComplete(onComplete);
  window.cca.onEnvironment(onEnvironmentChanged);
  setStatus('Ready.');
  setRunControls();
};

init().catch((error) => {
  setStatus(error?.message || String(error), 'error');
});
