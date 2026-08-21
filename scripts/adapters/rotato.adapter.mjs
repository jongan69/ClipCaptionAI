import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {projectRoot} from '../lib.mjs';
import {jobPaths} from '../platform/jobs.mjs';

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
      action('templates', 'Templates', 'sync'),
      action('inspect', 'Inspect'),
      action('render', 'Render', 'job', ['rotato', 'outputs']),
      action('raw', 'Raw passthrough', 'job', ['rotato']),
    ],
  },
  async build(actionId, input = {}) {
    const args = (input.args || []).map(String);
    if (actionId === 'render' && !args.includes('--json')) args.push('--json');
    return {
      command: process.execPath,
      args: [path.join(projectRoot, 'scripts', 'rotato-cli.mjs'), actionId, ...args],
      cwd: projectRoot,
    };
  },
  async collect(actionId, input = {}, context = {}) {
    if (actionId !== 'render') return {};
    const args = (input.args || []).map(String);
    const index = args.indexOf('--output');
    if (index < 0 || !args[index + 1]) return {};
    const output = path.resolve(args[index + 1]);
    if (!fs.existsSync(output)) return {};
    if (context.job?.id) {
      const lines = fs
        .readFileSync(jobPaths(context.job.id).stdout, 'utf8')
        .trim()
        .split('\n')
        .reverse();
      for (const line of lines)
        try {
          const parsed = JSON.parse(line);
          if (parsed.artifact?.path === output)
            return {artifacts: [output], artifact: parsed.artifact};
        } catch {
          // Keep scanning prior output lines before using the local fallback.
        }
    }
    const probe = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
      {encoding: 'utf8'},
    );
    let media = null;
    if (probe.status === 0)
      try {
        media = JSON.parse(probe.stdout);
      } catch {
        media = null;
      }
    return {
      artifacts: [output],
      artifact: {
        path: output,
        hash: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),
        media,
      },
    };
  },
};
