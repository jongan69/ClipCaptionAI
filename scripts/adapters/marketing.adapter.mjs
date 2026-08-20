import path from 'node:path';

import {projectRoot} from '../lib.mjs';

const passthrough = [{name: 'args', label: 'Arguments', type: 'textarea'}];
const entry = (id, title, mode = 'job', locks = []) => ({
  id,
  title,
  description: `${title} a marketing campaign.`,
  mode,
  aliases: [],
  args: passthrough,
  requirements: ['bun'],
  secrets: [],
  locks,
  setup: [],
});

export default {
  metadata: {
    id: 'marketing',
    title: 'Marketing campaigns',
    description: 'Plan, budget, execute, inspect, QA, and export campaign runs.',
    version: '1',
    actions: [
      entry('doctor', 'Doctor', 'sync'),
      entry('plan', 'Plan', 'job', ['campaigns']),
      entry('estimate', 'Estimate', 'job', ['campaigns']),
      entry('approve', 'Approve', 'sync', ['campaigns']),
      entry('execute', 'Execute', 'job', ['campaigns', 'outputs', 'gpu']),
      entry('inspect', 'Inspect', 'sync'),
      entry('qa', 'QA', 'job', ['campaigns']),
      entry('export', 'Export', 'job', ['campaigns', 'outputs']),
    ],
  },
  async build(actionId, input = {}) {
    return {
      command: process.execPath,
      args: [
        path.join(projectRoot, 'scripts', 'marketing.mjs'),
        actionId,
        ...(input.args || []).map(String),
      ],
      cwd: projectRoot,
    };
  },
};
