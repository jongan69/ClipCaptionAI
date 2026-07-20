#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectRoot, ensureDir} from './lib.mjs';

const args = process.argv.slice(2);

const helpText = `ClipCaptionAI Rotato bridge

Usage:
  npm run rotato -- doctor
  npm run rotato -- inspect /path/to/project.rotato [--json]
  npm run rotato -- render /path/to/project.rotato --output /path/to/output.mp4 [rotato flags]

Examples:
  clipcaptionai rotato doctor
  clipcaptionai rotato inspect ~/Desktop/demo.rotato --json
  clipcaptionai rotato render ~/Desktop/demo.rotato --screen-media ~/Desktop/app.mp4 --output outputs/mockups/demo.mp4

Notes:
  - This is a thin wrapper around the local Rotato CLI.
  - Use \`rotato inspect\` first when you need device indexes or 2D overlay ids.
  - Repeated flags like --screen-media, --screen-media-for, --set-2d-text, and --set-2d-image are passed through.
`;

const pathFlags = new Set(['--output', '--screen-media', '--set-2d-image']);
const pairedPathFlags = new Set(['--screen-media-for']);
const textPairFlags = new Set(['--set-2d-text']);

const printHelp = () => {
  console.log(helpText);
};

const commandExists = (command) => {
  const result = spawnSync('zsh', ['-lc', `command -v ${command}`], {
    cwd: projectRoot,
    stdio: 'ignore',
  });
  return result.status === 0;
};

const resolveInputPath = (value) => path.resolve(value.replace(/^['"]|['"]$/g, ''));

const resolveOutputPath = (value) => {
  const resolved = resolveInputPath(value);
  ensureDir(path.dirname(resolved));
  return resolved;
};

const buildRotatoArgs = (mode, modeArgs) => {
  if (modeArgs.length === 0) {
    throw new Error(`Missing .rotato project path for "${mode}".`);
  }

  const projectPath = resolveInputPath(modeArgs[0]);
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Rotato project not found: ${projectPath}`);
  }

  const forward = [mode, projectPath];
  for (let index = 1; index < modeArgs.length; index += 1) {
    const arg = modeArgs[index];
    forward.push(arg);

    if (pathFlags.has(arg)) {
      const value = modeArgs[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      forward.push(arg === '--output' ? resolveOutputPath(value) : resolveInputPath(value));
      index += 1;
      continue;
    }

    if (pairedPathFlags.has(arg) || textPairFlags.has(arg)) {
      const first = modeArgs[index + 1];
      const second = modeArgs[index + 2];
      if (!first || !second) {
        throw new Error(`Missing values for ${arg}`);
      }
      forward.push(first);
      forward.push(pairedPathFlags.has(arg) ? resolveInputPath(second) : second);
      index += 2;
    }
  }

  return forward;
};

const printDoctor = () => {
  const rotatoCliPath = commandExists('rotato')
    ? spawnSync('zsh', ['-lc', 'command -v rotato'], {
        cwd: projectRoot,
        encoding: 'utf8',
      }).stdout.trim()
    : null;
  const rotatoAppPath = '/Applications/Rotato.app';
  const appInstalled = fs.existsSync(rotatoAppPath);

  console.log('ClipCaptionAI Rotato doctor');
  console.log('===========================');
  console.log(`${rotatoCliPath ? 'OK ' : 'MISS'}  rotato CLI (${rotatoCliPath ?? 'not found'})`);
  console.log(`${appInstalled ? 'OK ' : 'MISS'}  Rotato app (${rotatoAppPath})`);

  if (!rotatoCliPath || !appInstalled) {
    process.exit(1);
  }
};

const main = () => {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args[0] === 'doctor') {
    printDoctor();
    return;
  }

  if (!commandExists('rotato')) {
    throw new Error('Rotato CLI is not installed or not on PATH. Run "clipcaptionai rotato doctor" first.');
  }

  const mode = args[0];
  if (!['inspect', 'render'].includes(mode)) {
    throw new Error(`Unsupported Rotato action "${mode}". Use inspect, render, or doctor.`);
  }

  const forwardArgs = buildRotatoArgs(mode, args.slice(1));
  const result = spawnSync('rotato', forwardArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 0);
};

main();
