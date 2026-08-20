import {projectRoot} from '../lib.mjs';

const action = (id, title, description, options = {}) => ({
  id,
  title,
  description,
  mode: options.mode ?? 'job',
  aliases: [],
  args: [{name: 'args', label: 'Arguments', type: 'textarea'}],
  requirements: ['ollama'],
  secrets: [],
  locks: options.locks ?? [],
  setup: options.setup ?? [],
});

export default {
  metadata: {
    id: 'ollama',
    title: 'Ollama',
    description: 'Manage the local Ollama service and model store.',
    version: '1',
    actions: [
      action('doctor', 'Doctor', 'Print the installed Ollama version.', {mode: 'sync'}),
      action('serve', 'Serve', 'Start the Ollama API service.', {locks: ['ollama-service']}),
      action('list', 'List', 'List installed models.', {mode: 'sync'}),
      action('show', 'Show', 'Show model metadata.', {mode: 'sync'}),
      action('pull', 'Pull', 'Download a model.', {
        locks: ['ollama-model-store'],
        setup: ['Pulls qwen3:4b when no model is supplied.'],
      }),
      action('run', 'Run', 'Run a model.', {locks: ['gpu']}),
      action('ps', 'Processes', 'List running models.', {mode: 'sync'}),
      action('stop', 'Stop', 'Stop a running model.', {mode: 'sync'}),
    ],
  },
  async build(actionId, input = {}) {
    const args = Array.isArray(input.args) ? input.args.map(String) : [];
    if (actionId === 'doctor') return {command: 'ollama', args: ['--version'], cwd: projectRoot};
    if (actionId === 'pull' && args.length === 0) args.push('qwen3:4b');
    return {command: 'ollama', args: [actionId, ...args], cwd: projectRoot};
  },
};
