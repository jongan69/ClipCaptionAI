import path from 'node:path';

import {projectRoot} from '../lib.mjs';

const action = (id, title, mode = 'job') => ({
  id,
  title,
  description: `${title} a command-based product capture.`,
  mode,
  aliases: [],
  args: [{name: 'args', type: 'textarea'}],
  requirements: [],
  secrets: [],
  locks: id === 'run' ? ['capture', 'outputs'] : [],
  setup: [],
});

export default {
  metadata: {
    id: 'capture',
    title: 'Product capture',
    description: 'Run manifest-owned capture commands without GUI automation.',
    version: '1',
    actions: [action('doctor', 'Doctor', 'sync'), action('run', 'Run')],
  },
  async build(actionId, input = {}) {
    return {
      command: process.execPath,
      args: [
        path.join(projectRoot, 'scripts', 'capture-cli.mjs'),
        actionId,
        ...(input.args || []).map(String),
      ],
      cwd: projectRoot,
    };
  },
};
