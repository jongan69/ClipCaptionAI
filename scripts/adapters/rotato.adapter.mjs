import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {projectRoot} from '../lib.mjs';

const action = (id, title, mode = 'job', locks = []) => ({
  id,
  title,
  description: `${title} with the installed Rotato CLI.`,
  mode,
  aliases: id === 'render' ? ['rotato', 'mockup'] : [],
  args: [{name: 'args', type: 'textarea'}],
  requirements: ['rotato'],
  secrets: [],
  locks,
  setup: [],
});

export default {
  metadata: {
    id: 'rotato',
    title: 'Rotato',
    description: 'Inspect and render Rotato projects with capability validation.',
    version: '1',
    actions: [
      action('doctor', 'Doctor', 'sync'),
      action('inspect', 'Inspect'),
      action('render', 'Render', 'job', ['rotato', 'outputs']),
      action('raw', 'Raw passthrough', 'job', ['rotato']),
    ],
  },
  async build(actionId, input = {}) {
    return {
      command: process.execPath,
      args: [
        path.join(projectRoot, 'scripts', 'rotato-cli.mjs'),
        actionId,
        ...(input.args || []).map(String),
      ],
      cwd: projectRoot,
    };
  },
  async collect(actionId, input = {}) {
    if (actionId !== 'render') return {};
    const args = (input.args || []).map(String);
    const index = args.indexOf('--output');
    if (index < 0) return {};
    const output = path.resolve(args[index + 1]);
    if (!fs.existsSync(output)) return {};
    const probe = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
      {encoding: 'utf8'},
    );
    return {
      artifacts: [output],
      artifact: {
        path: output,
        hash: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),
        media: probe.status === 0 ? JSON.parse(probe.stdout) : null,
      },
    };
  },
};
