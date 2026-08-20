#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {commandPath} from './command-utils.mjs';
import {ensureDir, loadEnv, projectRoot} from './lib.mjs';
import {hashValue} from './platform/catalog.mjs';

const argv = process.argv.slice(2);
loadEnv();
const help = `ClipCaptionAI Rotato adapter

Usage:
  clipcaptionai rotato doctor
  clipcaptionai rotato inspect <scene.rotato> [--json]
  clipcaptionai rotato render <scene.rotato> --output <file> [Rotato flags]
  clipcaptionai rotato render --template <id> --screen-slot <slot> <file> --output <file>
  clipcaptionai rotato raw <Rotato argv...>
`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const resolveFile = (value) => path.resolve(String(value).replace(/^['"]|['"]$/g, ''));
const rotatoPath = () =>
  commandPath('rotato') ||
  (fs.existsSync('/usr/local/bin/rotato') ? '/usr/local/bin/rotato' : null);

const invoke = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `rotato exited with ${result.status}`);
  return result;
};

const capabilities = () => {
  const executable = rotatoPath();
  if (!executable) throw new Error('Rotato CLI is not installed or on PATH.');
  const helpText = invoke(executable, ['--help']).stdout;
  return {executable, help: helpText, fingerprint: sha256(helpText)};
};

const inspect = (executable, scene) => {
  const result = invoke(executable, ['inspect', scene, '--json']);
  try {
    const data = JSON.parse(result.stdout);
    return {raw: result.stdout, data, fingerprint: hashValue(data)};
  } catch {
    throw new Error('Rotato inspect did not return valid JSON.');
  }
};

const takePair = (items, index, flag) => {
  const first = items[index + 1];
  const second = items[index + 2];
  if (first === undefined || second === undefined) throw new Error(`Missing values for ${flag}`);
  return [first, second];
};

const inspectIds = (value, indexes = new Set(), ids = new Set()) => {
  if (Array.isArray(value)) value.forEach((entry) => inspectIds(entry, indexes, ids));
  else if (value && typeof value === 'object')
    for (const [key, entry] of Object.entries(value)) {
      if (/index$/i.test(key) && Number.isInteger(entry)) indexes.add(entry);
      if (/(^|_)id$/i.test(key) && typeof entry === 'string') ids.add(entry);
      inspectIds(entry, indexes, ids);
    }
  return {indexes, ids};
};

const compileRender = (items) => {
  const templateIndex = items.indexOf('--template');
  const templateId = templateIndex >= 0 ? items[templateIndex + 1] : null;
  const positionalScene = items[0] && !items[0].startsWith('--') ? resolveFile(items[0]) : null;
  let scene = positionalScene;
  let template;
  if (templateId) {
    const directory = path.join(
      path.resolve(
        process.env.CCA_ROTATO_TEMPLATES_ROOT || path.join(projectRoot, 'templates', 'rotato'),
      ),
      templateId,
    );
    template = JSON.parse(fs.readFileSync(path.join(directory, 'template.json'), 'utf8'));
    scene = path.join(directory, 'scene.rotato');
  }
  if (!scene || !fs.existsSync(scene)) throw new Error(`Rotato project not found: ${scene || ''}`);
  if (items.includes('--screen-media') && items.includes('--screen-media-for'))
    throw new Error('ROTATO_SCREEN_MODE_CONFLICT');

  const capability = capabilities();
  const inspected = inspect(capability.executable, scene);
  if (template && template.inspectFingerprint !== inspected.fingerprint)
    throw new Error('TEMPLATE_INSPECT_MISMATCH');
  if (template) {
    const {indexes: deviceIndexes, ids: overlayIds} = inspectIds(inspected.data);
    const validDevices = Object.values(template.deviceSlots || {}).every((index) =>
      deviceIndexes.has(index),
    );
    const validOverlays = [
      ...Object.values(template.textOverlays || {}),
      ...Object.values(template.imageOverlays || {}),
    ].every((id) => overlayIds.has(id));
    if (!validDevices || !validOverlays) throw new Error('TEMPLATE_INSPECT_MISMATCH');
  }

  const forward = ['render', scene];
  for (let index = positionalScene ? 1 : 0; index < items.length; index += 1) {
    const flag = items[index];
    if (flag === '--template') {
      index += 1;
      continue;
    }
    if (['--screen-slot', '--text-slot', '--image-slot'].includes(flag)) {
      const [slot, value] = takePair(items, index, flag);
      const maps = {
        '--screen-slot': template?.deviceSlots,
        '--text-slot': template?.textOverlays,
        '--image-slot': template?.imageOverlays,
      };
      const target = maps[flag]?.[slot];
      if (target === undefined) throw new Error(`Unknown Rotato template slot: ${slot}`);
      const compiled = {
        '--screen-slot': '--screen-media-for',
        '--text-slot': '--set-2d-text',
        '--image-slot': '--set-2d-image',
      }[flag];
      forward.push(compiled, String(target), flag === '--text-slot' ? value : resolveFile(value));
      index += 2;
      continue;
    }
    if (['--output', '--screen-media'].includes(flag)) {
      const value = items[index + 1];
      if (!value) throw new Error(`Missing value for ${flag}`);
      const resolved = resolveFile(value);
      if (flag === '--output') ensureDir(path.dirname(resolved));
      forward.push(flag, resolved);
      index += 1;
      continue;
    }
    if (flag === '--screen-media-for') {
      const [device, value] = takePair(items, index, flag);
      forward.push(flag, device, resolveFile(value));
      index += 2;
      continue;
    }
    if (flag === '--set-2d-text') {
      const [overlay, value] = takePair(items, index, flag);
      forward.push(flag, overlay, value);
      index += 2;
      continue;
    }
    if (flag === '--set-2d-image') {
      const [overlay, value] = takePair(items, index, flag);
      forward.push(flag, overlay, resolveFile(value));
      index += 2;
      continue;
    }
    forward.push(flag);
  }
  return {capability, inspected, forward};
};

const main = () => {
  const [action, ...items] = argv;
  if (!action || action === '--help' || action === '-h') return console.log(help);
  if (action === 'doctor') {
    const capability = capabilities();
    return console.log(
      JSON.stringify({
        ok: true,
        executable: capability.executable,
        fingerprint: capability.fingerprint,
        appInstalled: fs.existsSync('/Applications/Rotato.app'),
      }),
    );
  }
  const {executable} = capabilities();
  if (action === 'raw')
    return process.exit(invoke(executable, items, {stdio: 'inherit'}).status || 0);
  if (action === 'inspect') {
    const scene = resolveFile(items[0]);
    if (!fs.existsSync(scene)) throw new Error(`Rotato project not found: ${scene}`);
    const result = inspect(executable, scene);
    return process.stdout.write(
      items.includes('--json') ? JSON.stringify(result.data) : result.raw,
    );
  }
  if (action !== 'render') throw new Error(`Unsupported Rotato action: ${action}`);
  const compiled = compileRender(items);
  const outputIndex = compiled.forward.indexOf('--output');
  const output = outputIndex >= 0 ? compiled.forward[outputIndex + 1] : null;
  const wantsJson = compiled.forward.includes('--json');
  const result = invoke(
    compiled.capability.executable,
    compiled.forward,
    wantsJson ? {} : {stdio: 'inherit'},
  );
  if (wantsJson && output && fs.existsSync(output)) {
    const media = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
      {encoding: 'utf8'},
    );
    let mediaInfo = null;
    if (media.status === 0)
      try {
        mediaInfo = JSON.parse(media.stdout);
      } catch {
        mediaInfo = null;
      }
    const artifact = {
      path: output,
      hash: sha256(fs.readFileSync(output)),
      media: mediaInfo,
      templateValidated: true,
      capabilityFingerprint: compiled.capability.fingerprint,
      inspectFingerprint: compiled.inspected.fingerprint,
    };
    const lastLine = result.stdout.trim().split('\n').filter(Boolean).at(-1);
    let rotato;
    try {
      rotato = lastLine ? JSON.parse(lastLine) : null;
    } catch {
      rotato = {stdout: result.stdout};
    }
    console.log(JSON.stringify({artifact, rotato}));
  } else if (wantsJson) process.stdout.write(result.stdout);
};

main();
