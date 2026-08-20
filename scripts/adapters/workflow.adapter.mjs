import path from 'node:path';

import {projectRoot} from '../lib.mjs';

const workflow = (command, title, description, aliases = [], args = []) => ({
  id: command,
  command,
  title,
  description,
  aliases,
  args,
});

const videoArg = [{name: 'video', label: 'Video file', type: 'text', required: true}];
const workflows = [
  workflow('frame', 'Download + Frame', 'Render downloaded media inside a frame.', [
    'framed',
    'frame-links',
  ]),
  workflow('ebay-ads', 'Cinematic eBay Ads', 'Create cinematic eBay listing ad packets.', [
    'ebay-cinematic-ads',
  ]),
  workflow(
    'ebay-intel',
    'eBay Creative Intel',
    'Create original blueprints from competitor research.',
    ['ebay-creative-intel'],
  ),
  workflow('fixed-clips', 'Fixed Clipping', 'Split downloaded videos into fixed clips.', ['fixed']),
  workflow(
    'split-video',
    'Split Local Video',
    'Split one local video into fixed clips.',
    ['slice-video'],
    videoArg,
  ),
  workflow('moments', 'Find Moments', 'Find and export strong source moments.'),
  workflow('review-moments', 'Review Moments', 'Review saved viral scorecards.', ['review']),
  workflow('auto-clips', 'Auto Clips', 'Find, caption, and render clips.', ['auto']),
  workflow('broll-captions', 'B-roll Heavy', 'Create captioned clips with contextual B-roll.', [
    'heavy',
  ]),
  workflow('caption', 'Caption Video', 'Caption an existing video.', [], videoArg),
  workflow('chapter', 'Detect Chapters', 'Detect chapters in a conversation video.', [], videoArg),
  workflow('tighten', 'Tighten Video', 'Find filler, repetition, and tangents.', [], videoArg),
  workflow(
    'compress',
    'Compress Video',
    'Compress a video with CRF encoding.',
    ['crush'],
    videoArg,
  ),
  workflow('enhance', 'Enhance Video', 'Add contextual B-roll and captions.', [], videoArg),
  workflow('broll', 'Find B-roll', 'Find reusable B-roll from a prompt.', ['finder']),
  workflow('video', 'Model Video Run', 'Plan, render, inspect, and QA model-directed video.'),
  workflow('voiceover', 'Voiceover', 'Generate ElevenLabs narration.', ['elevenlabs']),
  workflow('fal-image-edit', 'fal Image Edit', 'Create a reviewed image edit.'),
  workflow('fal-reference-video', 'fal Reference Video', 'Create a reviewed reference video.'),
  workflow('rerender', 'Rerender Clip', 'Rerender an existing generated clip.'),
  workflow('cleanup', 'Cleanup', 'Clean temporary or output files.'),
  workflow('open-latest', 'Open Latest', 'Open the newest output folder.'),
  workflow('transcribe', 'Transcribe', 'Transcribe an existing video.', [], videoArg),
  workflow('interview-qa', 'Interview QA', 'Analyze and repair interview pacing.', [], videoArg),
];

export default {
  metadata: {
    id: 'workflow',
    title: 'Reusable workflows',
    description: 'Run the repository-owned ClipCaptionAI workflows.',
    version: '1',
    workflows,
    actions: [
      {
        id: 'list',
        title: 'List',
        description: 'List workflows.',
        mode: 'sync',
        aliases: [],
        args: [],
        requirements: [],
        secrets: [],
        locks: [],
        setup: [],
      },
      {
        id: 'describe',
        title: 'Describe',
        description: 'Describe a workflow.',
        mode: 'sync',
        aliases: [],
        args: [{name: 'args', type: 'array'}],
        requirements: [],
        secrets: [],
        locks: [],
        setup: [],
      },
      {
        id: 'run',
        title: 'Run',
        description: 'Run a workflow.',
        mode: 'job',
        aliases: [],
        args: [{name: 'args', type: 'array'}],
        requirements: ['bun'],
        secrets: [
          'OPENAI_API_KEY',
          'DEEPSEEK_API_KEY',
          'YOUTUBE_API_KEY',
          'FAL_KEY',
          'ELEVENLABS_API_KEY',
          'ELEVENLABS_VOICE_ID',
          'EBAY_MCP_TOKEN',
        ],
        locks: ['outputs'],
        setup: [],
      },
    ],
  },
  async build(actionId, input = {}) {
    if (actionId !== 'run') throw new Error(`${actionId} is handled synchronously by the CLI.`);
    const name = String(input.workflow ?? '');
    const args = Array.isArray(input.args) ? input.args.map(String) : [];
    if (!workflows.some((entry) => entry.command === name))
      throw new Error(`Unknown workflow: ${name}`);
    if (name === 'transcribe')
      return {command: 'bun', args: ['run', 'transcribe', '--', ...args], cwd: projectRoot};
    if (name === 'interview-qa')
      return {
        command: 'bun',
        args: [path.join(projectRoot, 'scripts', 'interview-qa.mjs'), ...args],
        cwd: projectRoot,
      };
    return {
      command: process.execPath,
      args: [path.join(projectRoot, 'scripts', 'clipkit.mjs'), name, ...args],
      cwd: projectRoot,
      env: {CCA_LEGACY_CLI: '1'},
    };
  },
};
