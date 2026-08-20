import path from 'node:path';

import {projectRoot} from '../lib.mjs';

const action = (id, title, description, options = {}) => ({
  id,
  title,
  description,
  mode: options.mode ?? 'job',
  aliases: options.aliases ?? [],
  args: [{name: 'args', label: 'Arguments', type: 'textarea'}],
  requirements: ['yt-dlp'],
  secrets: [],
  locks: options.locks ?? [],
  setup: [],
});

export default {
  metadata: {
    id: 'ytdlp',
    title: 'yt-dlp',
    description: 'Inspect and download remote media without a shell.',
    version: '1',
    actions: [
      action('doctor', 'Doctor', 'Print the installed yt-dlp version.', {mode: 'sync'}),
      action('info', 'Info', 'Print media metadata.', {mode: 'sync'}),
      action('formats', 'Formats', 'List available media formats.', {mode: 'sync'}),
      action('download', 'Download', 'Download media.', {
        aliases: ['download', 'dl'],
        locks: ['downloads'],
      }),
      action('subtitles', 'Subtitles', 'Download subtitle tracks.', {locks: ['downloads']}),
    ],
  },
  async build(actionId, input = {}) {
    const args = Array.isArray(input.args) ? input.args.map(String) : [];
    if (actionId === 'doctor') return {command: 'yt-dlp', args: ['--version'], cwd: projectRoot};
    if (actionId === 'download' && args.includes('--links')) {
      return {
        command: process.execPath,
        args: [path.join(projectRoot, 'scripts', 'download-youtube.mjs'), ...args],
        cwd: projectRoot,
      };
    }
    const prefixes = {
      info: ['--dump-single-json'],
      formats: ['--list-formats'],
      download: [],
      subtitles: ['--write-subs', '--write-auto-subs', '--skip-download'],
    };
    return {command: 'yt-dlp', args: [...prefixes[actionId], ...args], cwd: projectRoot};
  },
};
