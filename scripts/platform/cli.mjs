import {spawn} from 'node:child_process';

import {sanitizeLogText} from '../../desktop/worker/progress.mjs';
import {discoverAdapters, findAlias, serializeCatalog} from './catalog.mjs';
import {
  cancelJob,
  listJobs,
  pruneJobs,
  readJob,
  readJobLogs,
  submitJob,
  waitForJob,
} from './jobs.mjs';

const removeFlag = (args, flag) => args.filter((value) => value !== flag);
const output = (json, payload) => {
  if (json) console.log(JSON.stringify(payload));
  else if (typeof payload === 'string') console.log(payload);
  else console.log(JSON.stringify(payload, null, 2));
};

const runForeground = async (spec, json) => {
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: {...process.env, ...spec.env},
    shell: false,
    stdio: json ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  let stdout = '';
  let stderr = '';
  if (json) {
    child.stdout.on('data', (chunk) => (stdout += sanitizeLogText(String(chunk))));
    child.stderr.on('data', (chunk) => (stderr += sanitizeLogText(String(chunk))));
  }
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({code, signal}));
  });
  if (json) output(true, {ok: result.code === 0, data: {stdout, stderr, ...result}});
  if (result.code !== 0) process.exitCode = result.code ?? 1;
};

const printJobs = (jobs, json) => {
  if (json) return output(true, {ok: true, data: jobs});
  if (jobs.length === 0) return console.log('No jobs.');
  for (const job of jobs) console.log(`${job.id}\t${job.status}\t${job.adapter}/${job.action}`);
};

async function handleJobs(args, json) {
  const [command = 'list', id] = args;
  if (command === 'list') return printJobs(listJobs(), json);
  if (!id && command !== 'prune') throw new Error(`jobs ${command} requires a job id.`);
  if (command === 'status') return output(json, json ? {ok: true, data: readJob(id)} : readJob(id));
  if (command === 'logs') {
    const logs = readJobLogs(id);
    if (json) return output(true, {ok: true, data: logs});
    process.stdout.write(logs.stdout.text);
    process.stderr.write(logs.stderr.text);
    return;
  }
  if (command === 'wait')
    return output(json, json ? {ok: true, data: await waitForJob(id)} : await waitForJob(id));
  if (command === 'cancel')
    return output(json, json ? {ok: true, data: cancelJob(id)} : cancelJob(id));
  if (command === 'prune') {
    const daysIndex = args.indexOf('--days');
    const days = daysIndex >= 0 ? Number(args[daysIndex + 1]) : 7;
    const removed = pruneJobs({olderThanMs: Math.max(0, days) * 86_400_000});
    return output(json, json ? {ok: true, data: {removed}} : {removed});
  }
  throw new Error(`Unknown jobs command: ${command}`);
}

async function handleInternal(adapter, action, args, json) {
  if (adapter.metadata.id !== 'workflow') return false;
  const workflows = adapter.metadata.workflows ?? [];
  if (action.id === 'list') {
    output(
      json,
      json
        ? {ok: true, data: workflows}
        : workflows.map((item) => `${item.command}\t${item.title}`).join('\n'),
    );
    return true;
  }
  if (action.id === 'describe') {
    const workflow = workflows.find((item) => item.command === args[0]);
    if (!workflow) throw new Error(`Unknown workflow: ${args[0] ?? ''}`);
    output(json, json ? {ok: true, data: workflow} : workflow);
    return true;
  }
  return false;
}

async function execute(adapter, action, input, {json, wait}) {
  if (await handleInternal(adapter, action, input.args ?? [], json)) return;
  if (action.mode === 'sync')
    return runForeground(await adapter.build(action.id, input, {action}), json);
  const catalog = await serializeCatalog();
  const metadata = catalog.find((item) => item.id === adapter.metadata.id);
  const job = submitJob({
    adapter: adapter.metadata.id,
    action: action.id,
    input,
    capabilityFingerprint: metadata?.capabilityFingerprint,
  });
  if (!wait)
    return output(json, json ? {ok: true, data: job} : {jobId: job.id, status: job.status});
  const completed = await waitForJob(job.id);
  const logs = readJobLogs(job.id);
  if (json) output(true, {ok: completed.status === 'completed', data: {...completed, logs}});
  else {
    process.stdout.write(logs.stdout.text);
    process.stderr.write(logs.stderr.text);
    console.log(`Job ${completed.id}: ${completed.status}`);
  }
  if (completed.status !== 'completed') process.exitCode = completed.exitCode ?? 1;
}

export async function runPlatformCli(rawArgs) {
  const json = rawArgs.includes('--json');
  const wait = rawArgs.includes('--wait');
  const args = removeFlag(removeFlag(rawArgs, '--json'), '--wait');
  const [namespace, actionName, ...rest] = args;
  if (!namespace) return false;

  try {
    if (namespace === 'adapters') {
      const catalog = await serializeCatalog();
      if ((actionName ?? 'list') === 'list')
        output(json, json ? {ok: true, data: catalog} : catalog);
      else if (actionName === 'describe') {
        const adapter = catalog.find((item) => item.id === rest[0]);
        if (!adapter) throw new Error(`Unknown adapter: ${rest[0] ?? ''}`);
        output(json, json ? {ok: true, data: adapter} : adapter);
      } else throw new Error(`Unknown adapters command: ${actionName}`);
      return true;
    }
    if (namespace === 'jobs') {
      await handleJobs([actionName, ...rest].filter(Boolean), json);
      return true;
    }

    const adapters = await discoverAdapters();
    const adapter = adapters.find((candidate) => candidate.metadata.id === namespace);
    if (adapter) {
      const action = adapter.metadata.actions.find((candidate) => candidate.id === actionName);
      if (!action) throw new Error(`Unknown action: ${namespace} ${actionName ?? ''}`);
      const input =
        namespace === 'workflow' && actionName === 'run'
          ? {workflow: rest[0], args: rest.slice(1)}
          : {args: rest};
      await execute(adapter, action, input, {json, wait});
      return true;
    }

    const alias = await findAlias(namespace);
    if (!alias) return false;
    const input = alias.workflow
      ? {
          workflow: alias.workflow.command,
          args: [actionName, ...rest].filter((value) => value !== undefined),
        }
      : {args: [actionName, ...rest].filter((value) => value !== undefined)};
    if (input.args.includes('--help') || input.args.includes('-h')) {
      const help = alias.workflow ?? alias.action;
      output(
        json,
        json
          ? {ok: true, data: help}
          : `Usage: clipcaptionai ${namespace} [options]\n\n${help.description}`,
      );
      return true;
    }
    await execute(alias.adapter, alias.action, input, {json, wait});
    return true;
  } catch (error) {
    if (json) output(true, {ok: false, error: {message: String(error?.message ?? error)}});
    else console.error(error?.message ?? error);
    process.exitCode = 1;
    return true;
  }
}
