#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import readline from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';
import {ensureDir, loadEnv, projectRoot} from './lib.mjs';

const usage = `
ClipCaptionAI command hub

Usage:
  npm run menu
  npm run clipkit -- <command> [options]

Commands:
  auto-clips        Download YouTube links, pick viral clips, caption, and render.
  caption           Caption any existing video with the current caption style.
  enhance           Add contextual B-roll and captions to an existing edit.
  broll             Find reusable B-roll clips from a text prompt file.
  rerender          Rerender an existing generated clip after caption/style edits.
  studio            Open Remotion Studio.
  open-latest       Open the newest folder in outputs.
  doctor            Check local dependencies and config.

Examples:
  npm run clipkit -- auto-clips --links links.txt --max-clips 6
  npm run clipkit -- caption --video "/path/to/video.mp4"
  npm run clipkit -- enhance --video "/path/to/edit.mp4" --run-name client-edit-v1
  npm run clipkit -- broll --prompts broll-prompts.txt --max-downloads 8
  npm run clipkit -- rerender --clip 03-your-website-is-leaking-money
`;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const npmRun = (script, args = []) => {
  run('npm', ['run', script, ...(args.length > 0 ? ['--', ...args] : [])]);
};

const commandExists = (command) => {
  const result = spawnSync('zsh', ['-lc', `command -v ${command}`], {
    cwd: projectRoot,
    stdio: 'ignore',
  });
  return result.status === 0;
};

const hasOpenAiKey = () => {
  loadEnv();
  return Boolean(process.env.OPENAI_API_KEY);
};

const textFileHasContent = (file, pattern = /[^\s#]/) => {
  if (!fs.existsSync(file)) {
    return false;
  }

  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .some((line) => pattern.test(line.trim()));
};

const ensurePromptFile = (file, contents) => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, contents);
  }
};

const openPath = (targetPath) => {
  spawnSync('open', [targetPath], {stdio: 'ignore'});
};

const latestOutputDir = () => {
  const outputsDir = path.join(projectRoot, 'outputs');
  if (!fs.existsSync(outputsDir)) {
    return null;
  }

  const dirs = fs
    .readdirSync(outputsDir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(outputsDir, entry.name);
      return {fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs};
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return dirs[0]?.fullPath ?? null;
};

const printDoctor = () => {
  const required = ['node', 'npm', 'ffmpeg', 'ffprobe', 'yt-dlp'];
  const optional = ['git'];
  const rows = [
    ...required.map((name) => ({name, required: true, ok: commandExists(name)})),
    ...optional.map((name) => ({name, required: false, ok: commandExists(name)})),
    {
      name: '.env',
      required: true,
      ok: fs.existsSync(path.join(projectRoot, '.env')),
    },
    {
      name: 'OPENAI_API_KEY',
      required: true,
      ok: hasOpenAiKey(),
    },
    {
      name: 'YOUTUBE_API_KEY',
      required: false,
      ok: Boolean(process.env.YOUTUBE_API_KEY),
    },
  ];

  console.log('ClipCaptionAI doctor');
  console.log('====================');
  for (const row of rows) {
    const mark = row.ok ? 'OK ' : row.required ? 'MISS' : 'SKIP';
    const requirement = row.required ? 'required' : 'optional';
    console.log(`${mark}  ${row.name} (${requirement})`);
  }

  const missingRequired = rows.filter((row) => row.required && !row.ok);
  if (missingRequired.length > 0) {
    console.log('');
    console.log('Fix the missing required items above before running the full workflows.');
    process.exit(1);
  }

  console.log('');
  console.log('Ready.');
};

const runAutoClips = (args = []) => {
  const linksPath = path.join(projectRoot, 'links.txt');
  ensurePromptFile(
    linksPath,
    '# Put one YouTube URL per line.\n# Blank lines and lines starting with # are ignored.\n',
  );

  if (args.length === 0 && !textFileHasContent(linksPath, /^https?:\/\//)) {
    console.log('No YouTube links found in links.txt. Opening it now.');
    openPath(linksPath);
    return;
  }

  npmRun('process', args.length > 0 ? args : [
    '--links',
    linksPath,
    '--out-dir',
    path.join(projectRoot, 'outputs'),
    '--max-clips',
    process.env.MAX_CLIPS ?? '6',
    '--padding-seconds',
    process.env.PADDING_SECONDS ?? '2',
  ]);
};

const runBroll = (args = []) => {
  const promptsPath = path.join(projectRoot, 'broll-prompts.txt');
  ensurePromptFile(
    promptsPath,
    '# Put one B-roll idea per line.\n# Example: Hungarian language barrier comedy movie scene\n',
  );

  if (args.length === 0 && !textFileHasContent(promptsPath)) {
    console.log('No B-roll prompts found in broll-prompts.txt. Opening it now.');
    openPath(promptsPath);
    return;
  }

  npmRun('broll:find', args.length > 0 ? args : [
    '--prompts',
    promptsPath,
    '--out-dir',
    path.join(projectRoot, 'outputs'),
  ]);
};

const askForVideo = async (rl, label) => {
  const answer = (await rl.question(`${label} video path: `)).trim();
  if (!answer) {
    console.log('No video path entered.');
    return null;
  }

  return answer.replace(/^['"]|['"]$/g, '');
};

const interactiveMenu = async () => {
  const rl = readline.createInterface({input, output});
  try {
    console.log('ClipCaptionAI');
    console.log('=============');
    console.log('1. Auto clip YouTube videos from links.txt');
    console.log('2. Caption an existing video');
    console.log('3. Enhance an existing edit with B-roll + captions');
    console.log('4. Find B-roll from broll-prompts.txt');
    console.log('5. Rerender/list a generated clip');
    console.log('6. Open Remotion Studio');
    console.log('7. Open newest output folder');
    console.log('8. Doctor');
    console.log('');

    const choice = (await rl.question('Choose 1-8: ')).trim();

    if (choice === '1') {
      runAutoClips();
      return;
    }
    if (choice === '2') {
      const video = await askForVideo(rl, 'Existing');
      if (video) {
        npmRun('caption:auto', ['--video', video]);
      }
      return;
    }
    if (choice === '3') {
      const video = await askForVideo(rl, 'Edited');
      if (video) {
        npmRun('broll:enhance', ['--video', video]);
      }
      return;
    }
    if (choice === '4') {
      runBroll();
      return;
    }
    if (choice === '5') {
      npmRun('rerender:clip', ['--list']);
      return;
    }
    if (choice === '6') {
      npmRun('studio');
      return;
    }
    if (choice === '7') {
      const latest = latestOutputDir();
      if (!latest) {
        console.log('No output folders found yet.');
        return;
      }
      openPath(latest);
      console.log(`Opened ${latest}`);
      return;
    }
    if (choice === '8') {
      printDoctor();
      return;
    }

    console.log('No matching menu option.');
  } finally {
    rl.close();
  }
};

const main = async () => {
  ensureDir(path.join(projectRoot, 'outputs'));

  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    await interactiveMenu();
    return;
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(usage);
    return;
  }

  if (command === 'auto-clips') {
    runAutoClips(args);
    return;
  }
  if (command === 'caption') {
    npmRun('caption:auto', args);
    return;
  }
  if (command === 'enhance') {
    npmRun('broll:enhance', args);
    return;
  }
  if (command === 'broll') {
    runBroll(args);
    return;
  }
  if (command === 'rerender') {
    npmRun('rerender:clip', args);
    return;
  }
  if (command === 'studio') {
    npmRun('studio');
    return;
  }
  if (command === 'open-latest') {
    const latest = latestOutputDir();
    if (!latest) {
      console.log('No output folders found yet.');
      return;
    }
    openPath(latest);
    console.log(`Opened ${latest}`);
    return;
  }
  if (command === 'doctor') {
    printDoctor();
    return;
  }

  console.log(`Unknown command: ${command}`);
  console.log(usage);
  process.exit(1);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
