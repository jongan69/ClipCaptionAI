#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {Command} from 'commander';
import {
  cancel,
  confirm,
  intro,
  isCancel,
  note,
  outro,
  select,
  text,
} from '@clack/prompts';
import pc from 'picocolors';
import {
  defaultCaptionStylePath,
  ensureDir,
  ensureOutputDirs,
  loadEnv,
  projectRoot,
  outputWorkRoot,
  outputsRoot,
  readCaptionStyleConfig,
} from './lib.mjs';
import {
  buildBrollCaptionArgs,
  mergeStyleConfig,
  slugify,
  timestampSlug,
} from './clipkit-lib.mjs';
import {commandExists} from './command-utils.mjs';
const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
const defaultFramePath = path.join(path.dirname(projectRoot), 'Frame.png');

const stylePresets = [
  {label: 'Main default', path: defaultCaptionStylePath},
  {label: 'Invert mask soft', path: path.join(projectRoot, 'styles', 'invert-mask-soft.json')},
  {label: 'Invert mask bold', path: path.join(projectRoot, 'styles', 'invert-mask-bold.json')},
  {label: 'Clean editorial', path: path.join(projectRoot, 'styles', 'clean-editorial.json')},
  {
    label: 'Custom scenes reference',
    path: path.join(projectRoot, 'styles', 'custom-scenes-reference.json'),
  },
  {
    label: 'B-roll heavy custom scenes',
    path: path.join(projectRoot, 'styles', 'broll-heavy-custom-scenes.json'),
  },
];

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

const withDefaultArgs = (defaults, args = []) => [...defaults, ...args];

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

const ensureStyleOverrideDir = () => {
  const dir = path.join(outputWorkRoot, 'menu-style-overrides');
  ensureDir(dir);
  return dir;
};

const writeMenuStyleOverride = ({workflowLabel, baseStylePath, overrides}) => {
  const resolvedBase = path.resolve(baseStylePath ?? defaultCaptionStylePath);
  const baseConfig = readCaptionStyleConfig(resolvedBase);
  const merged = mergeStyleConfig(baseConfig, overrides);
  const fileName = `${timestampSlug()}-${slugify(workflowLabel, 'workflow')}.json`;
  const outPath = path.join(ensureStyleOverrideDir(), fileName);
  fs.writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`);
  return outPath;
};

const unwrapPrompt = (value) => {
  if (isCancel(value)) {
    cancel('Cancelled.');
    process.exit(0);
  }
  return value;
};

const askYesNo = async (message, defaultValue = false) => {
  const answer = unwrapPrompt(
    await confirm({
      message,
      initialValue: defaultValue,
    }),
  );
  return Boolean(answer);
};

const askOptionalNumber = async (message, {min = null, max = null} = {}) => {
  const answer = unwrapPrompt(
    await text({
      message,
      placeholder: 'Leave blank to keep the current default',
      validate(value) {
        if (!value.trim()) {
          return;
        }
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          return 'Enter a valid number.';
        }
        if (min !== null && parsed < min) {
          return `Must be at least ${min}.`;
        }
        if (max !== null && parsed > max) {
          return `Must be at most ${max}.`;
        }
      },
    }),
  ).trim();
  if (!answer) {
    return null;
  }

  return Number(answer);
};

const askRenderOverrideBundle = async (
  {
    workflowLabel,
    defaultStylePath,
    allowContextScenes = false,
    allowSoundEffects = false,
    allowMovieScenes = false,
  },
) => {
  const useAdvanced = await askYesNo('Open advanced render settings for this run?', false);
  if (!useAdvanced) {
    return {extraArgs: []};
  }

  note(
    [
      `Workflow: ${workflowLabel}`,
      `Default style: ${path.relative(projectRoot, defaultStylePath)}`,
      'You can keep the workflow defaults or override the visual layer for this run only.',
    ].join('\n'),
    'Advanced settings',
  );

  let chosenStylePath = defaultStylePath;
  const styleChoice = unwrapPrompt(
    await select({
      message: 'Pick a style preset override',
      initialValue: 'keep-default',
      options: [
        {value: 'keep-default', label: 'Keep workflow default'},
        ...stylePresets.map((preset) => ({
          value: preset.path,
          label: preset.label,
          hint: path.relative(projectRoot, preset.path),
        })),
        {value: 'custom-path', label: 'Custom style-config path'},
      ],
    }),
  );
  if (styleChoice === 'custom-path') {
    const customPath = unwrapPrompt(
      await text({
        message: 'Custom style-config path',
        placeholder: '/absolute/or/relative/path/to/style.json',
        validate(value) {
          if (!value.trim()) {
            return 'Enter a path or cancel.';
          }
        },
      }),
    ).trim();
    chosenStylePath = path.resolve(customPath.replace(/^['"]|['"]$/g, ''));
  } else if (styleChoice !== 'keep-default') {
    chosenStylePath = path.resolve(String(styleChoice));
  }

  const position = unwrapPrompt(
    await select({
      message: 'Caption placement',
      initialValue: 'keep-default',
      options: [
        {value: 'keep-default', label: 'Keep workflow default'},
        {value: 'left-hook', label: 'Left hook'},
        {value: 'right-hook', label: 'Right hook'},
        {value: 'lower-left', label: 'Lower left'},
        {value: 'center-bottom', label: 'Center bottom'},
        {value: 'center-impact', label: 'Center impact'},
      ],
    }),
  );

  const disableCaptions = await askYesNo('Disable captions for this render?', false);
  const textOpacity = await askOptionalNumber(
    'Caption opacity override 0-1 (Enter keeps default): ',
    {min: 0, max: 1},
  );

  const framingChoice = unwrapPrompt(
    await select({
      message: 'Framing override',
      initialValue: 'keep-default',
      options: [
        {value: 'keep-default', label: 'Keep workflow default'},
        {value: 'vertical', label: 'Vertical crop', hint: '1080x1920 fill'},
        {value: 'vertical-contain', label: 'Vertical contain', hint: 'black bars, full frame visible'},
      ],
    }),
  );

  const extraArgs = [];
  if (framingChoice === 'vertical') {
    extraArgs.push('--vertical');
  } else if (framingChoice === 'vertical-contain') {
    extraArgs.push('--vertical-contain');
  }

  const styleOverrides = {};
  if (position !== 'keep-default') {
    styleOverrides.position = position;
  }
  if (textOpacity !== null) {
    styleOverrides.textOpacity = textOpacity;
  }
  if (disableCaptions) {
    styleOverrides.visibleTextLayerEnabled = false;
    styleOverrides.effectLayerEnabled = false;
  }

  if (allowContextScenes) {
    const contextChoice = unwrapPrompt(
      await select({
        message: 'B-roll / context scenes',
        initialValue: 'keep-default',
        options: [
          {value: 'keep-default', label: 'Keep workflow default'},
          {value: 'force-on', label: 'Force on'},
          {value: 'force-off', label: 'Force off'},
        ],
      }),
    );
    if (contextChoice === 'force-on') {
      extraArgs.push('--context-scenes');
    } else if (contextChoice === 'force-off') {
      extraArgs.push('--disable-context-scenes');
    }
  }

  if (allowSoundEffects) {
    const sfxChoice = unwrapPrompt(
      await select({
        message: 'Sound effects',
        initialValue: 'keep-default',
        options: [
          {value: 'keep-default', label: 'Keep workflow default'},
          {value: 'force-on', label: 'Force on'},
          {value: 'force-off', label: 'Force off'},
        ],
      }),
    );
    if (sfxChoice === 'force-on') {
      extraArgs.push('--sound-effects');
    } else if (sfxChoice === 'force-off') {
      extraArgs.push('--disable-sound-effects');
    }
  }

  if (allowMovieScenes) {
    const movieChoice = unwrapPrompt(
      await select({
        message: 'B-roll search style',
        initialValue: 'keep-default',
        options: [
          {value: 'keep-default', label: 'Keep workflow default'},
          {value: 'movie-scenes', label: 'Prefer movie / TV scenes'},
          {value: 'stock-broll', label: 'Prefer literal / stock-style B-roll'},
        ],
      }),
    );
    if (movieChoice === 'movie-scenes') {
      extraArgs.push('--movie-scenes');
    } else if (movieChoice === 'stock-broll') {
      extraArgs.push('--stock-broll');
    }
  }

  const hasStyleOverrides = Object.keys(styleOverrides).length > 0;
  if (hasStyleOverrides || chosenStylePath !== defaultStylePath) {
    const styleConfigPath = hasStyleOverrides
      ? writeMenuStyleOverride({
          workflowLabel,
          baseStylePath: chosenStylePath,
          overrides: styleOverrides,
        })
      : chosenStylePath;
    extraArgs.push('--style-config', styleConfigPath);
  }

  note(
    [
      chosenStylePath !== defaultStylePath
        ? `Style preset: ${path.relative(projectRoot, chosenStylePath)}`
        : 'Style preset: workflow default',
      disableCaptions ? 'Captions: disabled' : 'Captions: enabled',
      textOpacity !== null ? `Text opacity: ${textOpacity}` : 'Text opacity: workflow default',
      framingChoice === 'keep-default' ? 'Framing: workflow default' : `Framing: ${framingChoice}`,
    ].join('\n'),
    'Run overrides',
  );
  return {extraArgs};
};

const latestOutputDir = () => {
  const outputsDir = outputsRoot;
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
  const optional = ['git', 'whisper-cli', 'rotato'];
  const rows = [
    ...required.map((name) => ({name, required: true, ok: commandExists(name)})),
    ...optional.map((name) => ({name, required: false, ok: commandExists(name)})),
    {
      name: '.env',
      required: false,
      ok: fs.existsSync(path.join(projectRoot, '.env')),
    },
    {
      name: 'OPENAI_API_KEY',
      required: false,
      ok: hasOpenAiKey(),
    },
  ];

  console.log('ClipCaptionAI doctor');
  console.log('====================');
  for (const row of rows) {
    const mark = row.ok ? 'OK ' : row.required ? 'MISS' : 'SKIP';
    const requirement = row.required ? 'required' : 'optional';
    console.log(`${mark}  ${row.name} (${requirement})`);
  }

  const localTranscriptionReady = commandExists('whisper-cli');
  const cloudTranscriptionReady = hasOpenAiKey();
  const transcriptionReady = localTranscriptionReady || cloudTranscriptionReady;

  const missingRequired = rows.filter((row) => row.required && !row.ok);
  if (missingRequired.length > 0 || !transcriptionReady) {
    console.log('');
    if (missingRequired.length > 0) {
      console.log('Fix the missing required items above before running the full workflows.');
    }
    if (!transcriptionReady) {
      console.log('Transcription needs either whisper-cli installed locally or OPENAI_API_KEY in .env.');
    }
    process.exit(1);
  }

  console.log('');
  console.log(
    `Transcription backend ready: ${localTranscriptionReady ? 'local whisper.cpp' : 'OpenAI API'}`,
  );
  console.log(`AI text analysis available: ${hasOpenAiKey() ? 'yes' : 'no'}`);
  console.log(`Rotato mockup bridge available: ${commandExists('rotato') ? 'yes' : 'no'}`);
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

  npmRun('process', withDefaultArgs([
    '--links',
    linksPath,
    '--out-dir',
    outputsRoot,
    '--max-clips',
    process.env.MAX_CLIPS ?? '6',
    '--padding-seconds',
    process.env.PADDING_SECONDS ?? '2',
  ], args));
};

const runMomentsOnly = (args = []) => {
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

  npmRun('process', withDefaultArgs([
    '--links',
    linksPath,
    '--out-dir',
    outputsRoot,
    '--max-clips',
    process.env.MAX_CLIPS ?? '6',
    '--padding-seconds',
    process.env.PADDING_SECONDS ?? '2',
    '--raw-clips-only',
  ], args));
};

const runReviewMoments = (args = []) => {
  npmRun('moments:review', args);
};

const runBrollCaptions = (args = []) => {
  const linksPath = path.join(projectRoot, 'links.txt');
  ensurePromptFile(
    linksPath,
    '# Put one YouTube URL per line.\n# Use comment headers like "# Mani Videos" to tag the source profile for the lines below.\n',
  );

  if (args.length === 0 && !textFileHasContent(linksPath, /^https?:\/\//)) {
    console.log('No YouTube links found in links.txt. Opening it now.');
    openPath(linksPath);
    return;
  }

  npmRun(
    'process',
    buildBrollCaptionArgs({
      projectRoot,
      args,
      maxClips: process.env.MAX_CLIPS ?? '3',
      paddingSeconds: process.env.PADDING_SECONDS ?? '2',
    }),
  );
};

const runDownloadOnly = (args = []) => {
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

  npmRun('download:youtube', withDefaultArgs([
    '--links',
    linksPath,
    '--out-dir',
    outputsRoot,
  ], args));
};

const runFrameLinks = (args = []) => {
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

  const defaults = [
    '--links',
    linksPath,
    '--out-dir',
    outputsRoot,
  ];

  if (fs.existsSync(defaultFramePath)) {
    defaults.push('--frame', defaultFramePath);
  }

  npmRun('frame:links', withDefaultArgs(defaults, args));
};

const runEbayCinematicAds = (args = []) => {
  npmRun('ebay:cinematic-ads', args);
};

const runEbayCreativeIntel = (args = []) => {
  npmRun('ebay:creative-intel', args);
};

const runFixedClips = (args = []) => {
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

  npmRun('download:split', withDefaultArgs([
    '--links',
    linksPath,
    '--out-dir',
    outputsRoot,
    '--segment-seconds',
    process.env.FIXED_SEGMENT_SECONDS ?? '15',
  ], args));
};

const runLocalFixedClips = (args = []) => {
  npmRun('video:split', args);
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

  npmRun('broll:find', withDefaultArgs([
    '--prompts',
    promptsPath,
    '--out-dir',
    outputsRoot,
  ], args));
};

const askForVideo = async (label) => {
  const answer = unwrapPrompt(
    await text({
      message: `${label} video path`,
      placeholder: '/path/to/video.mp4',
    }),
  ).trim();
  if (!answer) {
    note('No video path entered. Nothing ran.', 'Skipped');
    return null;
  }

  return answer.replace(/^['"]|['"]$/g, '');
};

const askOptionalValue = async (message, placeholder = 'Leave blank to keep the default') => {
  const answer = unwrapPrompt(
    await text({
      message,
      placeholder,
    }),
  ).trim();
  return answer ? answer.replace(/^['"]|['"]$/g, '') : null;
};

const askFrameLinksOptions = async () => {
  const framePath = await askOptionalValue(
    'Frame image path',
    fs.existsSync(defaultFramePath)
      ? defaultFramePath
      : '/absolute/path/to/frame.png',
  );
  const frameArgs = ['--frame', framePath ?? defaultFramePath];

  const useAdvancedSlot = await askYesNo('Customize the frame slot for this run?', false);
  if (!useAdvancedSlot) {
    return frameArgs;
  }

  note(
    [
      'Defaults are tuned for /Users/jonathangan/Desktop/Frame.png.',
      'Use these when a future frame has a different opening or corner radius.',
    ].join('\n'),
    'Frame slot',
  );

  const x = await askOptionalNumber('Slot x-position', {min: 0});
  const y = await askOptionalNumber('Slot y-position', {min: 0});
  const width = await askOptionalNumber('Slot width', {min: 1});
  const height = await askOptionalNumber('Slot height', {min: 1});
  const radius = await askOptionalNumber('Slot corner radius', {min: 0});
  const fit = unwrapPrompt(
    await select({
      message: 'Video fit inside the slot',
      initialValue: 'cover',
      options: [
        {value: 'cover', label: 'Cover', hint: 'fills the slot, crops edges if needed'},
        {value: 'contain', label: 'Contain', hint: 'shows full video with letterboxing'},
      ],
    }),
  );

  if (x !== null) frameArgs.push('--x', String(x));
  if (y !== null) frameArgs.push('--y', String(y));
  if (width !== null) frameArgs.push('--width', String(width));
  if (height !== null) frameArgs.push('--height', String(height));
  if (radius !== null) frameArgs.push('--radius', String(radius));
  frameArgs.push('--fit', String(fit));

  return frameArgs;
};

const interactiveMenu = async () => {
  intro(pc.inverse(' ClipCaptionAI '));
  note(
    [
      `Project: ${projectRoot}`,
      'Use the menu for the polished front door, or run subcommands directly for repeatable automation.',
    ].join('\n'),
    'Workflow hub',
  );

  const choice = unwrapPrompt(
    await select({
      message: 'Pick a workflow',
      options: [
        {value: 'download', label: 'Download YouTube videos and stop', hint: 'outputs/download-run-*/downloads/'},
        {value: 'frame-links', label: 'Download YouTube videos into a frame', hint: 'uses links.txt + a desktop frame image'},
        {value: 'ebay-cinematic-ads', label: 'eBay cinematic listing ads', hint: 'Higgsfield briefs + final ad assembly/upload'},
        {value: 'ebay-creative-intel', label: 'eBay competitor creative blueprints', hint: 'Kalodata/TikTok/YouTube structure into original ads'},
        {value: 'fixed-clips', label: 'Download full videos and chop fixed 15s clips', hint: 'whole-source slicing'},
        {value: 'split-video', label: 'Cut one local video into fixed 15s clips', hint: 'no YouTube needed'},
        {value: 'moments', label: 'Find important moments only', hint: 'clean source clips for manual edits'},
        {value: 'auto-clips', label: 'Full auto-clips pipeline', hint: 'download, transcribe, select, caption, render'},
        {value: 'broll-captions', label: 'B-roll-heavy labeled workflow', hint: 'local custom scenes + captions'},
        {value: 'caption', label: 'Caption one existing video', hint: 'keep the base edit intact'},
        {value: 'enhance', label: 'Enhance an existing edit with B-roll', hint: 'timed cutaways + captions'},
        {value: 'broll', label: 'Find standalone B-roll from prompts', hint: 'no final render'},
        {value: 'rerender', label: 'Rerender or list a generated clip', hint: 'fix text or style and rerender'},
        {value: 'cleanup', label: 'Clean temp files / old outputs'},
        {value: 'studio', label: 'Open Remotion Studio'},
        {value: 'open-latest', label: 'Open newest output folder'},
        {value: 'doctor', label: 'Doctor / dependency check'},
      ],
    }),
  );

  if (choice === 'download') {
    runDownloadOnly();
    outro('Download workflow finished.');
    return;
  }
  if (choice === 'frame-links') {
    const frameArgs = await askFrameLinksOptions();
    runFrameLinks(frameArgs);
    outro('Frame render workflow finished.');
    return;
  }
  if (choice === 'ebay-cinematic-ads') {
    const mode = unwrapPrompt(
      await select({
        message: 'Pick an eBay ad step',
        options: [
          {value: 'roi-plan', label: 'Plan Higgsfield credit spend', hint: 'rank listings before rendering'},
          {value: 'prepare', label: 'Prepare Higgsfield briefs', hint: 'pull listing photos and write shot prompts'},
          {value: 'seed-local-broll', label: 'Seed owned local B-roll', hint: 'use local footage before searching'},
          {value: 'find-broll', label: 'Find listing story B-roll', hint: 'context clips for the ad finish'},
          {value: 'assemble', label: 'Assemble rendered clips', hint: 'turn Higgsfield clips into an eBay MP4'},
          {value: 'upload', label: 'Upload final video', hint: 'create eBay video and optionally attach'},
        ],
      }),
    );

    if (mode === 'roi-plan') {
      const creditBudget = await askOptionalNumber('Higgsfield credit budget', {min: 1});
      const creditsPerShot = await askOptionalNumber('Estimated credits per generated shot', {min: 1});
      const maxListings = await askOptionalNumber('Maximum listings to queue', {min: 1});
      const maxHiggsShots = await askOptionalNumber('Maximum paid Higgs shots per listing', {min: 1});
      const skipItemIds = await askOptionalValue(
        'Optional listing IDs to skip',
        'Comma-separated item IDs, for example 398166069187',
      );
      const prepareSelected = await askYesNo('Prepare selected listing folders now?', true);
      runEbayCinematicAds([
        'roi-plan',
        ...(creditBudget === null ? [] : ['--credit-budget', String(creditBudget)]),
        ...(creditsPerShot === null ? [] : ['--credits-per-shot', String(creditsPerShot)]),
        ...(maxListings === null ? [] : ['--max-listings', String(maxListings)]),
        ...(maxHiggsShots === null ? [] : ['--max-higgs-shots', String(maxHiggsShots)]),
        ...(skipItemIds ? ['--skip-item-ids', skipItemIds] : []),
        ...(prepareSelected ? ['--prepare-selected'] : []),
      ]);
      outro('Higgsfield ROI plan finished.');
      return;
    }

    if (mode === 'prepare') {
      const itemIds = await askOptionalValue(
        'eBay listing ID(s)',
        'Comma-separated item IDs, for example 398160795273',
      );
      if (itemIds) {
        runEbayCinematicAds(['prepare', '--item-ids', itemIds]);
        outro('eBay cinematic brief prep finished.');
      }
      return;
    }

    if (mode === 'seed-local-broll') {
      const projectDir = await askOptionalValue(
        'Listing project folder',
        'outputs/ebay-cinematic-ads/.../<item-id>',
      );
      if (projectDir) {
        runEbayCinematicAds(['seed-local-broll', '--project-dir', projectDir]);
        outro('Local B-roll seed finished.');
      }
      return;
    }

    if (mode === 'find-broll') {
      const projectDir = await askOptionalValue(
        'Listing project folder',
        'outputs/ebay-cinematic-ads/.../<item-id>',
      );
      if (projectDir) {
        runEbayCinematicAds(['find-broll', '--project-dir', projectDir]);
        outro('Story B-roll search finished.');
      }
      return;
    }

    if (mode === 'assemble') {
      const projectDir = await askOptionalValue(
        'Listing project folder',
        'outputs/ebay-cinematic-ads/.../<item-id>',
      );
      if (projectDir) {
        const includeBroll = await askYesNo('Include story B-roll finish?', true);
        runEbayCinematicAds([
          'assemble',
          '--project-dir',
          projectDir,
          ...(includeBroll ? ['--include-broll', '--broll-position', 'end'] : []),
        ]);
        outro('eBay cinematic assembly finished.');
      }
      return;
    }

    if (mode === 'upload') {
      const itemId = await askOptionalValue('eBay listing ID', '398160795273');
      const video = await askOptionalValue('Final MP4 path', '/absolute/path/to/final.mp4');
      if (itemId && video) {
        const attach = await askYesNo('Attach video to listing after upload?', false);
        const applyNow = attach
          ? await askYesNo('Apply the listing media update immediately?', false)
          : false;
        runEbayCinematicAds([
          'upload',
          '--item-id',
          itemId,
          '--video',
          video,
          ...(attach ? ['--attach'] : []),
          ...(applyNow ? ['--apply-immediately'] : []),
          '--poll',
        ]);
        outro('eBay cinematic upload finished.');
      }
      return;
    }
  }
  if (choice === 'ebay-creative-intel') {
    const projectDir = await askOptionalValue(
      'Listing project folder',
      'outputs/ebay-cinematic-ads/.../<item-id>',
    );
    if (projectDir) {
      const competitors = await askOptionalValue(
        'Optional Kalodata/competitor export',
        '/absolute/path/to/kalodata-export.csv',
      );
      const discoverYoutube = await askYesNo('Also seed public YouTube competitor metadata with yt-dlp?', false);
      runEbayCreativeIntel([
        'plan',
        '--project-dir',
        projectDir,
        ...(competitors ? ['--competitors', competitors] : []),
        ...(discoverYoutube ? ['--discover-youtube'] : []),
      ]);
      outro('Competitive creative blueprint finished.');
    }
    return;
  }
  if (choice === 'fixed-clips') {
    runFixedClips();
    outro('Fixed-clip workflow finished.');
    return;
  }
  if (choice === 'split-video') {
    const video = await askForVideo('Local');
    if (video) {
      runLocalFixedClips(['--video', video]);
      outro('Local fixed-clip workflow finished.');
    }
    return;
  }
  if (choice === 'moments') {
    runMomentsOnly();
    outro('Moments-only workflow finished.');
    return;
  }
  if (choice === 'auto-clips') {
    const {extraArgs} = await askRenderOverrideBundle({
      workflowLabel: 'auto-clips',
      defaultStylePath: defaultCaptionStylePath,
      allowContextScenes: true,
      allowSoundEffects: true,
    });
    runAutoClips(extraArgs);
    outro('Auto-clips workflow finished.');
    return;
  }
  if (choice === 'broll-captions') {
    const {extraArgs} = await askRenderOverrideBundle({
      workflowLabel: 'broll-captions',
      defaultStylePath: path.join(projectRoot, 'styles', 'broll-heavy-custom-scenes.json'),
      allowContextScenes: true,
      allowSoundEffects: true,
    });
    runBrollCaptions(extraArgs);
    outro('B-roll-heavy workflow finished.');
    return;
  }
  if (choice === 'caption') {
    const video = await askForVideo('Existing');
    if (video) {
      const {extraArgs} = await askRenderOverrideBundle({
        workflowLabel: 'caption',
        defaultStylePath: defaultCaptionStylePath,
      });
      npmRun('caption:auto', ['--video', video, ...extraArgs]);
      outro('Caption render finished.');
    }
    return;
  }
  if (choice === 'enhance') {
    const video = await askForVideo('Edited');
    if (video) {
      const {extraArgs} = await askRenderOverrideBundle({
        workflowLabel: 'enhance',
        defaultStylePath: defaultCaptionStylePath,
        allowContextScenes: true,
        allowMovieScenes: true,
      });
      npmRun('broll:enhance', ['--video', video, ...extraArgs]);
      outro('Enhance workflow finished.');
    }
    return;
  }
  if (choice === 'broll') {
    runBroll();
    outro('B-roll finder finished.');
    return;
  }
  if (choice === 'rerender') {
    const runDir = await askOptionalValue(
      'Optional run folder',
      'Press Enter to use the latest run folder',
    );
    const clipId = await askOptionalValue(
      'Clip number, slug, title fragment, or .captions.json path',
      'Press Enter to list editable clips only',
    );
    const rerenderArgs = [];
    if (runDir) {
      rerenderArgs.push('--run', runDir);
    }
    if (clipId) {
      rerenderArgs.push('--clip', clipId);
      const {extraArgs} = await askRenderOverrideBundle({
        workflowLabel: 'rerender',
        defaultStylePath: defaultCaptionStylePath,
      });
      rerenderArgs.push(...extraArgs);
    } else {
      rerenderArgs.push('--list');
    }
    npmRun('rerender:clip', rerenderArgs);
    outro(clipId ? 'Rerender finished.' : 'Listed editable clips.');
    return;
  }
  if (choice === 'cleanup') {
    npmRun('cleanup');
    outro('Cleanup finished.');
    return;
  }
  if (choice === 'studio') {
    npmRun('studio');
    outro('Remotion Studio launched.');
    return;
  }
  if (choice === 'open-latest') {
    const latest = latestOutputDir();
    if (!latest) {
      note('No output folders found yet.', 'Nothing to open');
      outro('Done.');
      return;
    }
    openPath(latest);
    note(latest, 'Opened latest output folder');
    outro('Done.');
    return;
  }
  if (choice === 'doctor') {
    printDoctor();
    outro('Doctor finished.');
    return;
  }
};

const configurePassthroughCommand = (program, name, description, action, aliases = []) => {
  const command = program
    .command(name)
    .description(description)
    .allowUnknownOption(true)
    .argument('[args...]')
    .action((args) => action(args));

  for (const alias of aliases) {
    command.alias(alias);
  }

  return command;
};

const createProgram = () => {
  const program = new Command();
  program
    .name('clipcaptionai')
    .description('CLI-first AI video editor and model harness for planning, rendering, captioning, B-roll, and QA.')
    .version(packageJson.version)
    .showHelpAfterError()
    .showSuggestionAfterError();

  program.addHelpText(
    'after',
    `
Examples:
  clipcaptionai menu
  clipcaptionai video run --brief-file brief.txt --assets-dir assets --json
  clipcaptionai video qa --run outputs/video-runs/brief
  clipcaptionai download --links links.txt
  clipcaptionai frame --links links.txt --frame /Users/jonathangan/Desktop/Frame.png
  clipcaptionai ebay-ads prepare --item-ids 398160795273
  clipcaptionai ebay-intel plan --project-dir outputs/ebay-cinematic-ads/.../398160795273 --competitors kalodata.csv
  clipcaptionai ebay-ads assemble --project-dir outputs/ebay-cinematic-ads/.../398160795273
  clipcaptionai fixed-clips --links links.txt --segment-seconds 15
  clipcaptionai split-video --video "/path/to/video.mp4" --segment-seconds 15
  clipcaptionai moments --links links.txt --max-clips 6 --padding-seconds 2
  clipcaptionai review-moments --write --format markdown
  clipcaptionai auto-clips --links links.txt --max-clips 6
  clipcaptionai broll-captions --links links.txt --max-clips 3
  clipcaptionai caption --video "/path/to/video.mp4"
  clipcaptionai rotato render ~/Desktop/demo.rotato --screen-media ~/Desktop/app.mp4 --output outputs/mockups/demo.mp4
  clipcaptionai voiceover --script narration.txt --voice-id VOICE_ID
  clipcaptionai fal-image-edit --image approved.jpg --prompt "Edit instruction" --approved-for-generated-marketing
  clipcaptionai fal-reference-video --image approved.jpg --prompt "Animation instruction" --approved-for-generated-marketing
  clipcaptionai rerender --clip 03-your-website-is-leaking-money --no-captions
`,
  );

  program.command('menu').description('Open the interactive workflow menu.').action(interactiveMenu);
  configurePassthroughCommand(program, 'download', 'Download YouTube links from a text file and stop.', runDownloadOnly, ['dl']);
  configurePassthroughCommand(program, 'frame', 'Download YouTube links and render each video inside a frame image.', runFrameLinks, ['framed', 'frame-links']);
  configurePassthroughCommand(program, 'ebay-ads', 'Create cinematic eBay listing ad briefs, assemblies, and uploads.', runEbayCinematicAds, ['ebay-cinematic-ads']);
  configurePassthroughCommand(program, 'ebay-intel', 'Turn competitor/trend references into original eBay video blueprints.', runEbayCreativeIntel, ['ebay-creative-intel']);
  configurePassthroughCommand(program, 'fixed-clips', 'Download YouTube links, then chop each full source into fixed clips.', runFixedClips, ['fixed']);
  configurePassthroughCommand(program, 'split-video', 'Cut one local video into fixed clips without using YouTube.', runLocalFixedClips, ['slice-video']);
  configurePassthroughCommand(program, 'moments', 'Download YouTube links, pick the strongest moments, and export clean source clips.', runMomentsOnly);
  configurePassthroughCommand(program, 'review-moments', 'Review why moments were flagged as viral and optionally persist scorecards.', runReviewMoments, ['review']);
  configurePassthroughCommand(program, 'auto-clips', 'Download YouTube links, pick viral clips, caption, and render.', runAutoClips, ['auto']);
  configurePassthroughCommand(program, 'broll-captions', 'Run the B-roll-heavy labeled workflow.', runBrollCaptions, ['heavy']);
  configurePassthroughCommand(program, 'caption', 'Caption any existing video with the current caption style.', (args) => npmRun('caption:auto', args));
  configurePassthroughCommand(program, 'enhance', 'Add contextual B-roll and captions to an existing edit.', (args) => npmRun('broll:enhance', args));
  configurePassthroughCommand(program, 'broll', 'Find reusable B-roll clips from a text prompt file.', runBroll, ['finder']);
  configurePassthroughCommand(program, 'video', 'Plan, render, inspect, and QA model-directed videos.', (args) => run('node', ['scripts/video.mjs', ...args]));
  configurePassthroughCommand(program, 'rotato', 'Inspect or render Rotato mockup projects through the local Rotato CLI.', (args) => npmRun('rotato', args), ['mockup']);
  configurePassthroughCommand(program, 'voiceover', 'Generate a local ElevenLabs narration file and non-secret manifest.', (args) => npmRun('voiceover:elevenlabs', args), ['elevenlabs']);
  configurePassthroughCommand(program, 'fal-image-edit', 'Create a reviewed marketing/B-roll image edit through fal GPT Image 2.', (args) => npmRun('fal:image-edit', args));
  configurePassthroughCommand(program, 'fal-reference-video', 'Create a muted, human-reviewed Veo 3.1 reference-video proof through fal.', (args) => npmRun('fal:reference-video', args));
  configurePassthroughCommand(program, 'rerender', 'Rerender an existing generated clip after caption/style edits.', (args) => npmRun('rerender:clip', args));
  configurePassthroughCommand(program, 'cleanup', 'Clean temp files or old output folders.', (args) => npmRun('cleanup', args));
  program.command('studio').description('Open Remotion Studio.').action(() => npmRun('studio'));
  program.command('open-latest').description('Open the newest output folder in Finder.').action(() => {
    const latest = latestOutputDir();
    if (!latest) {
      console.log('No output folders found yet.');
      return;
    }
    openPath(latest);
    console.log(`Opened ${latest}`);
  });
  program.command('doctor').description('Check local dependencies and config.').action(printDoctor);

  return program;
};

const main = async () => {
  ensureOutputDirs();

  if (process.argv.length <= 2) {
    await interactiveMenu();
    return;
  }

  await createProgram().parseAsync(process.argv);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
