import path from 'node:path';

import {projectRoot} from '../lib.mjs';

const action = (id, title, mode = 'job', locks = []) => ({
  id,
  title,
  description: `${title} through the installed Higgsfield CLI.`,
  mode,
  aliases: [],
  args: [{name: 'args', type: 'textarea'}],
  requirements: ['higgsfield'],
  secrets: ['HIGGSFIELD_API_KEY'],
  locks,
  setup: [],
});

export default {
  metadata: {
    id: 'higgsfield',
    title: 'Higgsfield',
    description: 'Estimate and resume budget-gated Higgsfield generation.',
    version: '1',
    actions: [
      action('doctor', 'Doctor', 'sync'),
      action('estimate', 'Estimate'),
      action('submit', 'Submit', 'job', ['higgsfield-credits']),
      action('poll', 'Poll'),
      action('collect', 'Collect', 'job', ['outputs']),
    ],
  },
  async build(actionId, input = {}) {
    return {
      command: process.execPath,
      args: [
        path.join(projectRoot, 'scripts', 'higgsfield-cli.mjs'),
        actionId,
        ...(input.args || []).map(String),
      ],
      cwd: projectRoot,
    };
  },
};
