import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkJson = process.argv.includes('--json');
const outputDir = path.join(projectRoot, 'outputs');
const checkFile = path.join(projectRoot, '.cca-desktop-check');

const hasCommand = (command) => {
  try {
    const checkCommand = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(checkCommand, [command], {
      stdio: 'ignore',
    });
    return result.status === 0;
  } catch {
    return false;
  }
};

const requiredFiles = [
  {path: path.join(projectRoot, 'bin', 'clipcaptionai.js'), label: 'CLI entrypoint'},
  {path: path.join(projectRoot, 'scripts', 'clipkit.mjs'), label: 'Command hub'},
];

const requiredCommands = [
  {name: 'node', label: 'Node.js'},
  {name: 'ffmpeg', label: 'ffmpeg'},
  {name: 'ffprobe', label: 'ffprobe'},
];

const optionalCommands = [
  {name: 'yt-dlp', label: 'yt-dlp'},
  {name: 'remotion', label: 'Remotion CLI'},
  {name: 'openai', label: 'OpenAI CLI'},
];

const run = () => {
  const report = {
    ok: true,
    missingRequired: [],
    missingOptional: [],
    missingFiles: [],
    projectRoot,
    node: process.version,
  };

  for (const item of requiredCommands) {
    if (!hasCommand(item.name)) {
      report.ok = false;
      report.missingRequired.push(item.label);
    }
  }

  for (const item of requiredFiles) {
    if (!fs.existsSync(item.path)) {
      report.ok = false;
      report.missingFiles.push(item.label);
    }
  }

  for (const item of optionalCommands) {
    if (!hasCommand(item.name)) {
      report.missingOptional.push(item.label);
    }
  }

  try {
    fs.mkdirSync(outputDir, {recursive: true});
    fs.writeFileSync(checkFile, 'ok', 'utf8');
    fs.unlinkSync(checkFile);
  } catch {
    report.ok = false;
    report.missingFiles.push('Project output dir write permission');
  }

  try {
    const commandCheck = spawnSync(
      'node',
      [path.join(projectRoot, 'bin', 'clipcaptionai.js'), '--help'],
      {
        cwd: projectRoot,
        stdio: 'ignore',
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    if (commandCheck.status !== 0) {
      report.ok = false;
      report.missingRequired.push('CLI entrypoint execution');
    }
  } catch {
    report.ok = false;
    report.missingRequired.push('CLI entrypoint execution');
  }

  return report;
};

const report = run();

if (checkJson) {
  console.log(JSON.stringify(report));
} else {
  if (report.ok) {
    console.log('✅ Desktop preflight: required dependencies are available.');
  } else {
    console.log('🚨 Desktop preflight: required dependencies are missing.');
  }

  if (report.missingRequired.length > 0) {
    console.log(`Missing required: ${report.missingRequired.join(', ')}`);
  }

  if (report.missingFiles.length > 0) {
    console.log(`Missing files: ${report.missingFiles.join(', ')}`);
  }

  if (report.missingOptional.length > 0) {
    console.log(`Optional command(s) not found (features may be limited): ${report.missingOptional.join(', ')}`);
  }
}

if (!report.ok) {
  process.exitCode = 1;
}
