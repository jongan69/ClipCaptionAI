import fs from 'node:fs';
import path from 'node:path';

import {projectRoot} from '../lib.mjs';

const action = (id, title, mode = 'job', locks = []) => ({
  id,
  title,
  description: `${title} licensed, high-resolution stock images.`,
  mode,
  aliases: [],
  args: [{name: 'args', label: 'Arguments', type: 'textarea'}],
  requirements: ['bun'],
  secrets: id === 'doctor' ? [] : ['PEXELS_API_KEY'],
  locks,
  setup: [],
});

export default {
  metadata: {
    id: 'stock',
    title: 'Licensed stock images',
    description: 'Search and download portrait Pexels originals with reusable provenance.',
    version: '1',
    actions: [
      action('doctor', 'Inspect', 'sync'),
      action('search', 'Search'),
      action('download', 'Download', 'job', ['stock', 'outputs']),
    ],
  },
  async build(actionId, input = {}) {
    return {
      command: process.execPath,
      args: [
        path.join(projectRoot, 'scripts', 'stock-cli.mjs'),
        actionId,
        ...(input.args || []).map(String),
      ],
      cwd: projectRoot,
    };
  },
  async collect(actionId, input = {}) {
    if (actionId !== 'download') return {};
    const args = (input.args || []).map(String);
    const index = args.indexOf('--out');
    if (index < 0 || !args[index + 1]) return {};
    const manifest = path.join(path.resolve(projectRoot, args[index + 1]), 'stock-manifest.json');
    if (!fs.existsSync(manifest)) return {};
    const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    return {artifacts: [manifest, ...data.files.map((entry) => entry.path)], result: data};
  },
};
