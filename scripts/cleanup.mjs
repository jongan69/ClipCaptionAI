#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';

const usage = `
Usage:
  npm run cleanup
  npm run cleanup -- --temp --yes
  npm run cleanup -- --outputs --keep-latest 5 --yes
  npm run cleanup -- --all --yes

Options:
  --temp             Clean temporary render staging: outputs/work/ and public/media/.
  --outputs          Clean old output folders, keeping the newest folders.
  --keep-latest N    Number of output folders to keep with --outputs. Default: 5.
  --all              Clean temp files and all output folders.
  --dry-run          Show what would be deleted, but do not delete.
  --yes              Delete without asking for confirmation.

No files are deleted unless you confirm interactively or pass --yes.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const sizeOf = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    return 0;
  }

  const stat = fs.lstatSync(targetPath);
  if (!stat.isDirectory()) {
    return stat.size;
  }

  return fs.readdirSync(targetPath).reduce((total, entry) => {
    return total + sizeOf(path.join(targetPath, entry));
  }, 0);
};

const listChildren = (dir) => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((entry) => entry !== '.gitkeep')
    .map((entry) => path.join(dir, entry));
};

const listOutputDirs = () => {
  const outputsDir = path.join(projectRoot, 'outputs');
  if (!fs.existsSync(outputsDir)) {
    return [];
  }

  return fs
    .readdirSync(outputsDir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(outputsDir, entry.name);
      return {
        path: fullPath,
        name: entry.name,
        mtimeMs: fs.statSync(fullPath).mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
};

const buildPlan = ({cleanTemp, cleanOutputs, cleanAll, keepLatest}) => {
  const targets = [];

  if (cleanTemp || cleanAll) {
    targets.push(...listChildren(path.join(projectRoot, 'outputs', 'work')));
    targets.push(...listChildren(path.join(projectRoot, 'public', 'media')));
  }

  if (cleanOutputs || cleanAll) {
    const outputDirs = listOutputDirs();
    const outputTargets = cleanAll
      ? outputDirs
      : outputDirs.slice(Math.max(0, keepLatest));
    targets.push(...outputTargets.map((entry) => entry.path));
  }

  const uniqueTargets = [...new Set(targets)].filter((targetPath) =>
    fs.existsSync(targetPath),
  );

  return uniqueTargets.map((targetPath) => ({
    path: targetPath,
    size: sizeOf(targetPath),
  }));
};

const printPlan = (plan) => {
  if (plan.length === 0) {
    console.log('Nothing to clean.');
    return;
  }

  const total = plan.reduce((sum, item) => sum + item.size, 0);
  console.log(`Will delete ${plan.length} item(s), freeing about ${formatBytes(total)}:`);
  for (const item of plan) {
    console.log(`- ${path.relative(projectRoot, item.path)} (${formatBytes(item.size)})`);
  }
};

const askInteractiveMode = async () => {
  const rl = readline.createInterface({input, output});
  try {
    console.log('Cleanup');
    console.log('=======');
    console.log('1. Temp files only');
    console.log('2. Old output folders, keep newest 5');
    console.log('3. Temp files + old output folders, keep newest 5');
    console.log('4. Everything generated: temp files + all output folders');
    console.log('5. Dry run only');
    console.log('');

    const choice = (await rl.question('Choose 1-5: ')).trim();
    if (choice === '1') {
      return {cleanTemp: true, cleanOutputs: false, cleanAll: false, keepLatest: 5, dryRun: false};
    }
    if (choice === '2') {
      return {cleanTemp: false, cleanOutputs: true, cleanAll: false, keepLatest: 5, dryRun: false};
    }
    if (choice === '3') {
      return {cleanTemp: true, cleanOutputs: true, cleanAll: false, keepLatest: 5, dryRun: false};
    }
    if (choice === '4') {
      return {cleanTemp: false, cleanOutputs: false, cleanAll: true, keepLatest: 0, dryRun: false};
    }
    if (choice === '5') {
      return {cleanTemp: true, cleanOutputs: true, cleanAll: false, keepLatest: 5, dryRun: true};
    }

    console.log('No cleanup option selected.');
    return null;
  } finally {
    rl.close();
  }
};

const confirmDelete = async (plan) => {
  const rl = readline.createInterface({input, output});
  try {
    const answer = (await rl.question('Delete these files? Type DELETE to confirm: ')).trim();
    return answer === 'DELETE';
  } finally {
    rl.close();
  }
};

const main = async () => {
  ensureDir(path.join(projectRoot, 'outputs'));
  ensureDir(path.join(projectRoot, 'outputs', 'work'));
  ensureDir(path.join(projectRoot, 'public', 'media'));

  const explicitMode =
    Boolean(args.temp) || Boolean(args.outputs) || Boolean(args.all);
  const interactive = process.stdin.isTTY && process.stdout.isTTY;

  let options = {
    cleanTemp: Boolean(args.temp),
    cleanOutputs: Boolean(args.outputs),
    cleanAll: Boolean(args.all),
    keepLatest: Number(args['keep-latest'] ?? 5),
    dryRun: Boolean(args['dry-run']),
  };

  if (!explicitMode && interactive) {
    const interactiveOptions = await askInteractiveMode();
    if (!interactiveOptions) {
      return;
    }
    options = interactiveOptions;
  }

  if (!explicitMode && !interactive) {
    options = {
      cleanTemp: true,
      cleanOutputs: true,
      cleanAll: false,
      keepLatest: 5,
      dryRun: true,
    };
  }

  if (!Number.isFinite(options.keepLatest) || options.keepLatest < 0) {
    throw new Error('--keep-latest must be a number greater than or equal to 0.');
  }

  const plan = buildPlan(options);
  printPlan(plan);

  if (plan.length === 0 || options.dryRun) {
    if (options.dryRun) {
      console.log('Dry run only. Nothing deleted.');
    }
    return;
  }

  const confirmed = args.yes || (interactive && await confirmDelete(plan));
  if (!confirmed) {
    console.log('Cleanup canceled. Nothing deleted.');
    return;
  }

  for (const item of plan) {
    fs.rmSync(item.path, {recursive: true, force: true});
  }

  ensureDir(path.join(projectRoot, 'outputs'));
  ensureDir(path.join(projectRoot, 'outputs', 'work'));
  ensureDir(path.join(projectRoot, 'public', 'media'));

  console.log('Cleanup complete.');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
