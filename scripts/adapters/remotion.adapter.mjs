import path from 'node:path';

import {projectRoot} from '../lib.mjs';

const passthrough = [{name: 'args', type: 'array'}];
const action = (id, title, description, options = {}) => ({
  id,
  title,
  description,
  mode: options.mode ?? 'job',
  aliases: options.aliases ?? [],
  args: passthrough,
  requirements: ['bun', '@remotion/cli'],
  secrets: [],
  locks: options.locks ?? [],
  setup: options.setup ?? [],
});

export default {
  metadata: {
    id: 'remotion',
    title: 'Remotion',
    description: 'Inspect, develop, and render Remotion compositions.',
    version: '1',
    actions: [
      action('doctor', 'Doctor', 'Verify the local Remotion CLI.', {mode: 'sync'}),
      action('versions', 'Versions', 'Print installed Remotion package versions.', {mode: 'sync'}),
      action('compositions', 'Compositions', 'List available compositions.'),
      action('render', 'Render', 'Render a composition.', {locks: ['gpu', 'outputs']}),
      action('still', 'Still', 'Render a still image.', {locks: ['gpu', 'outputs']}),
      action('studio', 'Studio', 'Open Remotion Studio.', {
        aliases: ['studio'],
        locks: ['remotion-studio'],
      }),
      action('browser', 'Browser', 'Ensure Remotion browser assets are installed.', {
        locks: ['remotion-browser'],
        setup: ['Downloads Remotion browser assets when missing.'],
      }),
    ],
  },
  async build(actionId, input = {}) {
    const args = Array.isArray(input.args) ? input.args.map(String) : [];
    const commands = {
      doctor: ['versions'],
      versions: ['versions'],
      compositions: ['compositions', path.join(projectRoot, 'src', 'index.tsx')],
      render: ['render'],
      still: ['still'],
      studio: ['studio', path.join(projectRoot, 'src', 'index.tsx')],
      browser: ['browser', 'ensure'],
    };
    return {command: 'bunx', args: ['remotion', ...commands[actionId], ...args], cwd: projectRoot};
  },
};
