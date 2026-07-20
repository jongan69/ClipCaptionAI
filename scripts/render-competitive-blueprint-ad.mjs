#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';
import {timestampSlug} from './clipkit-lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/render-competitive-blueprint-ad.mjs --blueprint outputs/.../creative-blueprint.json
  npm run ebay:render-blueprint-ad -- --blueprint outputs/.../creative-blueprint.json

Options:
  --blueprint FILE          Competitive creative blueprint JSON.
  --project-dir DIR         Listing project folder. Defaults to sibling path inferred from blueprint.
  --out FILE                Output MP4. Default: project-dir/final/<item-id>-competitive-preview-ad.mp4
  --duration N              Override duration seconds. Default: blueprint target or shot-map duration.
  --width N                 Default: 1080
  --height N                Default: 1920
  --fps N                   Default: 30
  --music-track FILE        Optional quiet background music.
  --music-volume N          Default: 0.035
  --no-music                Disable background music.
  --voiceover FILE          Optional seller voiceover MP3/WAV/M4A to mix above music and SFX.
  --voiceover-volume N      Default: 1.0
  --sfx-library DIR         Default: ./sfx-library
  --sfx-volume N            Default: 0.095
  --no-sfx                  Disable transition SFX.

This is a product-safe preview renderer. It copies the competitor video's structure only.
It never uses competitor footage/audio/captions in the final MP4.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const requireArg = (key) => {
  if (!args[key]) throw new Error(`Missing --${key}.\n${usage}`);
  return String(args[key]);
};

const shellFile = (file) => `file '${String(file).replaceAll("'", "'\\''")}'`;

const run = (cmd, cmdArgs, options = {}) => {
  execFileSync(cmd, cmdArgs, {stdio: 'inherit', ...options});
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const ffprobeDuration = (file) => {
  try {
    const output = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
      {encoding: 'utf8'},
    );
    const duration = Number(output.trim());
    return Number.isFinite(duration) ? duration : 0;
  } catch {
    return 0;
  }
};

const listFiles = (dir, pattern) => {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (pattern.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files.sort((a, b) => a.localeCompare(b));
};

const findListingProjectDir = (blueprintPath, blueprint) => {
  if (args['project-dir']) return path.resolve(String(args['project-dir']));
  const itemId = blueprint?.listing?.item_id;
  const blueprintDir = path.dirname(blueprintPath);
  const candidates = [
    path.resolve(blueprintDir, '..', '..', 'projects', String(itemId)),
    path.resolve(blueprintDir, '..', 'projects', String(itemId)),
    path.resolve(blueprintDir, '..', '..', '..', 'projects', String(itemId)),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'listing.json'))) ?? blueprintDir;
};

const imageListForListing = (listing, projectDir) => {
  const fromListing = (listing.images ?? [])
    .map((image) => {
      if (image.path) {
        const projectRelative = path.resolve(projectRoot, image.path);
        const localRelative = path.resolve(projectDir, image.path);
        return fs.existsSync(projectRelative) ? projectRelative : localRelative;
      }
      return image.filename ? path.join(projectDir, image.filename) : null;
    })
    .filter(Boolean);
  const local = fs.existsSync(projectDir)
    ? fs.readdirSync(projectDir)
      .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => path.join(projectDir, name))
    : [];
  return [...new Set([...fromListing, ...local])].filter((file) => fs.existsSync(file));
};

const truncate = (value, max = 38) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 14 ? space : max).trim()}...`;
};

const plainCaption = (value) =>
  String(value ?? '')
    .replace(/[^a-zA-Z0-9 .,+&$%/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const captionForShot = ({shot, listingTitle}) => {
  const role = shot.role ?? shot.beat ?? 'shot';
  const candidate = shot.original_asset_plan?.caption_strategy ?? shot.caption_intent;
  const genericIntent = /^(one-line pattern interrupt|what is for sale|condition and included items|buyer outcome|view on ebay\s*\/\s*check listing details)$/i;
  if (/hook/i.test(role)) return 'Before you buy';
  if (candidate && !genericIntent.test(String(candidate).trim())) return plainCaption(candidate);
  if (/hero/i.test(role)) return 'Actual listing item';
  if (/proof|detail/i.test(role)) return 'Real details. Real condition.';
  if (/broll|use-case/i.test(role)) return 'Picture it in your space';
  if (/offer|cta|close/i.test(role)) return 'Check the eBay listing';
  return 'View full details';
};

const normalizeShots = (blueprint) => {
  if (Array.isArray(blueprint.shot_replica_map) && blueprint.shot_replica_map.length > 0) {
    return blueprint.shot_replica_map.map((shot, index) => ({
      index,
      role: shot.role ?? `shot-${index + 1}`,
      start: Number(shot.reference_timing?.start_seconds ?? index * 2),
      end: Number(shot.reference_timing?.end_seconds ?? (index + 1) * 2),
      sourceAssets: shot.original_asset_plan?.source_assets ?? [],
      caption: shot.original_asset_plan?.caption_strategy,
      sfx: shot.original_asset_plan?.sound_design ?? [],
    }));
  }

  return (blueprint.beats ?? []).map((beat, index) => ({
    index,
    role: beat.beat ?? `beat-${index + 1}`,
    start: Number(beat.time_seconds?.start ?? index * 3),
    end: Number(beat.time_seconds?.end ?? (index + 1) * 3),
    sourceAssets: (beat.source_assets ?? []).map((label) => ({label, file: null})),
    caption: beat.caption_intent,
    sfx: beat.sfx ?? [],
  }));
};

const fitShotsToDuration = (shots, duration) => {
  const valid = shots
    .map((shot) => ({
      ...shot,
      duration: Math.max(0.5, Number((shot.end - shot.start).toFixed(3))),
    }))
    .filter((shot) => shot.duration > 0);
  const sourceTotal = valid.reduce((sum, shot) => sum + shot.duration, 0) || 1;
  let cursor = 0;
  return valid.map((shot, index) => {
    const scaledDuration = index === valid.length - 1
      ? Math.max(0.5, duration - cursor)
      : Math.max(0.5, (shot.duration / sourceTotal) * duration);
    const normalized = {
      ...shot,
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + scaledDuration).toFixed(3)),
      duration: Number(scaledDuration.toFixed(3)),
    };
    cursor += scaledDuration;
    return normalized;
  });
};

const createCaptionPng = ({file, width, height, text, subtext, role}) => {
  const specPath = `${file}.json`;
  fs.writeFileSync(specPath, `${JSON.stringify({file, width, height, text, subtext, role}, null, 2)}\n`);
  run('python3', [
    '-c',
    String.raw`
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
spec=json.load(open(sys.argv[1]))
W,H=spec["width"],spec["height"]
out=Path(spec["file"])
font_candidates=[
 "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
 "/System/Library/Fonts/Supplemental/Arial.ttf",
 "/System/Library/Fonts/SFNS.ttf",
]
def font(size):
 for p in font_candidates:
  try: return ImageFont.truetype(p, size)
  except Exception: pass
 return ImageFont.load_default()
def wrap_text(draw, text, fnt, max_width, max_lines):
 words=str(text).split()
 lines=[]
 current=""
 for word in words:
  candidate=(current+" "+word).strip()
  if draw.textlength(candidate, font=fnt) <= max_width:
   current=candidate
  else:
   if current:
    lines.append(current)
   current=word
  if len(lines) >= max_lines:
   break
 if current and len(lines) < max_lines:
  lines.append(current)
 if len(lines) > max_lines:
  lines=lines[:max_lines]
 if len(lines) == max_lines and len(" ".join(words)) > len(" ".join(lines)):
  lines[-1]=lines[-1].rstrip(".") + "..."
 return lines or [""]
img=Image.new("RGBA",(W,H),(0,0,0,0))
d=ImageDraw.Draw(img)
main=spec["text"][:64]
sub=spec.get("subtext") or ""
role=(spec.get("role") or "").lower()
main_size=82 if "hook" in role else 68
sub_size=42
f1=font(main_size); f2=font(sub_size)
safe_w=W-160
main_lines=wrap_text(d, main, f1, safe_w, 2)
sub_lines=wrap_text(d, sub[:54], f2, safe_w, 1) if sub else []
lines=[(line, f1, True) for line in main_lines] + [(line, f2, False) for line in sub_lines]
gap=18
bboxes=[d.textbbox((0,0), line, font=fnt) for line,fnt,_ in lines]
widths=[b[2]-b[0] for b in bboxes]
heights=[b[3]-b[1] for b in bboxes]
pad_x=46; pad_y=30
box_w=min(W-80, max(widths)+pad_x*2)
box_h=sum(heights)+gap*(len(lines)-1)+pad_y*2
x=(W-box_w)//2
y=H-255-box_h
d.rounded_rectangle([x,y,x+box_w,y+box_h], radius=24, fill=(0,0,0,160))
cy=y+pad_y
for i,(line,f,is_main) in enumerate(lines):
 bbox=d.textbbox((0,0), line, font=f)
 tw=bbox[2]-bbox[0]
 tx=(W-tw)//2
 fill=(255,255,255,255) if is_main else (230,236,242,245)
 d.text((tx,cy), line, font=f, fill=fill, stroke_width=4 if is_main else 2, stroke_fill=(0,0,0,220))
 cy += heights[i]+gap
img.save(out)
`,
    specPath,
  ]);
};

const renderImageSegment = ({image, captionPng, out, duration, width, height, fps, index}) => {
  const frames = Math.max(1, Math.round(duration * fps));
  const zoomExpr = index % 2 === 0
    ? `min(1.095,1+0.075*on/${frames})`
    : `max(1.0,1.075-0.075*on/${frames})`;
  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-loop',
    '1',
    '-i',
    image,
    '-loop',
    '1',
    '-t',
    duration.toFixed(3),
    '-i',
    captionPng,
    '-filter_complex',
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,zoompan=z='${zoomExpr}':d=${frames}:s=${width}x${height}:fps=${fps},fade=t=in:st=0:d=0.10,fade=t=out:st=${Math.max(0, duration - 0.16).toFixed(3)}:d=0.16[base];[base][1:v]overlay=0:0,format=yuv420p[vout]`,
    '-map',
    '[vout]',
    '-t',
    duration.toFixed(3),
    '-r',
    String(fps),
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    out,
  ]);
};

const renderVideoSegment = ({video, captionPng, out, duration, width, height, fps}) => {
  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    video,
    '-loop',
    '1',
    '-t',
    duration.toFixed(3),
    '-i',
    captionPng,
    '-filter_complex',
    `[0:v]trim=0:${duration.toFixed(3)},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},fade=t=in:st=0:d=0.10,fade=t=out:st=${Math.max(0, duration - 0.16).toFixed(3)}:d=0.16[base];[base][1:v]overlay=0:0,format=yuv420p[vout]`,
    '-map',
    '[vout]',
    '-t',
    duration.toFixed(3),
    '-r',
    String(fps),
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    out,
  ]);
};

const readSfxLibrary = (libraryDir) => {
  const indexPath = path.join(libraryDir, 'index.json');
  if (!fs.existsSync(indexPath)) return [];
  return (readJson(indexPath).sounds ?? [])
    .filter((sound) => sound?.hasAudio !== false && sound.file)
    .map((sound) => ({...sound, filePath: path.join(libraryDir, sound.file)}))
    .filter((sound) => fs.existsSync(sound.filePath));
};

const pickSfx = (library, categories, seed) => {
  const wanted = new Set(categories);
  const pool = library.filter((sound) => wanted.has(sound.category));
  const fallback = pool.length > 0 ? pool : library;
  return fallback.length ? fallback[Math.abs(seed) % fallback.length] : null;
};

const categoriesForRole = (role) => {
  const text = String(role ?? '').toLowerCase();
  if (text.includes('hook')) return ['impact', 'camera', 'whoosh'];
  if (text.includes('hero')) return ['whoosh', 'impact'];
  if (text.includes('proof') || text.includes('detail')) return ['click', 'camera', 'pop'];
  if (text.includes('broll') || text.includes('use-case')) return ['whoosh', 'pop'];
  return ['money', 'impact', 'pop'];
};

const muxAudio = ({inputVideo, outVideo, shots, musicTrack, musicEnabled, musicVolume, voiceoverPath, voiceoverVolume, sfxEnabled, sfxLibraryDir, sfxVolume}) => {
  const duration = ffprobeDuration(inputVideo);
  const library = sfxEnabled ? readSfxLibrary(sfxLibraryDir) : [];
  const sfxEvents = sfxEnabled
    ? shots.map((shot, index) => ({
      shot,
      sound: pickSfx(library, categoriesForRole(shot.role), index * 17),
      startSeconds: Math.min(Math.max(0.03, shot.start + 0.03), Math.max(0, duration - 0.2)),
    })).filter((event) => event.sound)
    : [];
  const hasMusic = musicEnabled && musicTrack && fs.existsSync(musicTrack);
  const hasVoiceover = voiceoverPath && fs.existsSync(voiceoverPath);
  const planPath = `${outVideo.replace(/\.[^.]+$/, '')}.audio-plan.json`;

  if (!hasMusic && !hasVoiceover && sfxEvents.length === 0) {
    fs.copyFileSync(inputVideo, outVideo);
    fs.writeFileSync(planPath, `${JSON.stringify({music: null, voiceover: null, sfx_events: []}, null, 2)}\n`);
    return {planPath, events: []};
  }

  const inputArgs = ['-i', inputVideo];
  const filters = [`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${duration.toFixed(3)}[base]`];
  const mixLabels = ['[base]'];
  let inputIndex = 1;

  if (hasMusic) {
    inputArgs.push('-stream_loop', '-1', '-i', musicTrack);
    filters.push(`[${inputIndex}:a]aformat=channel_layouts=stereo,atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${musicVolume}[music]`);
    mixLabels.push('[music]');
    inputIndex += 1;
  }

  if (hasVoiceover) {
    inputArgs.push('-i', voiceoverPath);
    filters.push(`[${inputIndex}:a]aformat=channel_layouts=stereo,atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${voiceoverVolume}[voiceover]`);
    mixLabels.push('[voiceover]');
    inputIndex += 1;
  }

  for (const event of sfxEvents) inputArgs.push('-i', event.sound.filePath);
  sfxEvents.forEach((event, index) => {
    const delayMs = Math.max(0, Math.round(event.startSeconds * 1000));
    const sourceIndex = inputIndex + index;
    const sfxDuration = Math.min(0.7, Number(event.sound.durationSeconds ?? 0.7));
    filters.push(`[${sourceIndex}:a]aformat=channel_layouts=stereo,atrim=0:${sfxDuration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${sfxVolume},adelay=${delayMs}|${delayMs}[sfx${index}]`);
    mixLabels.push(`[sfx${index}]`);
  });
  filters.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:normalize=0:dropout_transition=0,alimiter=limit=0.96[aout]`);

  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...inputArgs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-map_metadata',
    '-1',
    '-dn',
    outVideo,
  ]);

  fs.writeFileSync(planPath, `${JSON.stringify({
    music: hasMusic ? {file: musicTrack, volume: musicVolume} : null,
    voiceover: hasVoiceover ? {file: voiceoverPath, volume: voiceoverVolume} : null,
    sfx_events: sfxEvents.map((event) => ({
      start_seconds: event.startSeconds,
      role: event.shot.role,
      sound_id: event.sound.id,
      sound_file: event.sound.file,
      volume: sfxVolume,
    })),
  }, null, 2)}\n`);
  return {planPath, events: sfxEvents};
};

const blueprintPath = path.resolve(requireArg('blueprint'));
if (!fs.existsSync(blueprintPath)) throw new Error(`Blueprint not found: ${blueprintPath}`);
const blueprint = readJson(blueprintPath);
const projectDir = findListingProjectDir(blueprintPath, blueprint);
const listingPath = path.join(projectDir, 'listing.json');
const listing = fs.existsSync(listingPath)
  ? readJson(listingPath)
  : {item_id: blueprint.listing?.item_id, title: blueprint.listing?.title};
const itemId = String(listing.item_id ?? listing.itemId ?? blueprint.listing?.item_id ?? path.basename(projectDir));
const width = Number(args.width ?? 1080);
const height = Number(args.height ?? 1920);
const fps = Number(args.fps ?? 30);
const musicVolume = Number(args['music-volume'] ?? 0.035);
const voiceoverVolume = Number(args['voiceover-volume'] ?? 1);
const sfxVolume = Number(args['sfx-volume'] ?? 0.095);
const finalDir = path.join(projectDir, 'final');
const workDir = path.join(projectDir, 'outputs', `competitive-preview-${timestampSlug()}`);
ensureDir(finalDir);
ensureDir(workDir);

const outPath = path.resolve(String(args.out ?? path.join(finalDir, `${itemId}-competitive-preview-ad.mp4`)));
const images = imageListForListing(listing, projectDir);
if (images.length === 0) throw new Error(`No listing images found for ${itemId} in ${projectDir}`);
const brollClips = listFiles(path.join(projectDir, 'story-broll'), /\.(mp4|mov|m4v|webm)$/i);
const rawShots = normalizeShots(blueprint);
const targetDuration = Number(args.duration ?? blueprint.target_duration_seconds ?? rawShots.at(-1)?.end ?? 16);
const shots = fitShotsToDuration(rawShots, Math.min(45, Math.max(8, targetDuration)));
const imageByLabel = new Map(images.map((file, index) => [`image_${index + 1}`, file]));

const renderedSegments = shots.map((shot, index) => {
  const captionPng = path.join(workDir, `${String(index + 1).padStart(2, '0')}-caption.png`);
  const role = shot.role ?? `shot-${index + 1}`;
  const caption = captionForShot({shot: {...shot, original_asset_plan: {caption_strategy: shot.caption}}, listingTitle: listing.title});
  const subtext = index === 0 ? truncate(listing.title ?? blueprint.listing?.title ?? 'eBay listing', 48) : '';
  createCaptionPng({file: captionPng, width, height, text: caption, subtext, role});

  const labels = (shot.sourceAssets ?? []).map((asset) => asset.label ?? asset).filter(Boolean);
  const wantsBroll = labels.includes('cleared_story_broll') || /broll|use-case/i.test(role);
  const broll = wantsBroll && brollClips.length > 0 ? brollClips[index % brollClips.length] : null;
  const imageLabel = labels.find((label) => imageByLabel.has(label)) ?? 'image_1';
  const image = imageByLabel.get(imageLabel) ?? images[index % images.length] ?? images[0];
  const segmentPath = path.join(workDir, `${String(index + 1).padStart(2, '0')}-${role.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.mp4`);

  if (broll) {
    renderVideoSegment({video: broll, captionPng, out: segmentPath, duration: shot.duration, width, height, fps});
  } else {
    renderImageSegment({image, captionPng, out: segmentPath, duration: shot.duration, width, height, fps, index});
  }

  return {
    ...shot,
    rendered_segment: segmentPath,
    source_kind: broll ? 'cleared_story_broll' : 'listing_image',
    source_file: broll ?? image,
    caption,
  };
});

const concatFile = path.join(workDir, 'segments.txt');
fs.writeFileSync(concatFile, `${renderedSegments.map((segment) => shellFile(segment.rendered_segment)).join('\n')}\n`);
const silentVideo = path.join(workDir, `${itemId}-competitive-preview-silent.mp4`);
run('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  concatFile,
  '-c',
  'copy',
  silentVideo,
]);

const musicTrack = args['music-track']
  ? path.resolve(String(args['music-track']))
  : path.join(projectRoot, 'music-library', 'lofi-house', '01-dmca-free-lofi-chilled-beats.mp3');
const voiceoverPath = args.voiceover ? path.resolve(String(args.voiceover)) : null;
if (voiceoverPath && !fs.existsSync(voiceoverPath)) throw new Error(`Voiceover not found: ${voiceoverPath}`);
const audio = muxAudio({
  inputVideo: silentVideo,
  outVideo: outPath,
  shots: renderedSegments,
  musicTrack,
  musicEnabled: args['no-music'] !== true,
  musicVolume,
  voiceoverPath,
  voiceoverVolume,
  sfxEnabled: args['no-sfx'] !== true,
  sfxLibraryDir: path.resolve(String(args['sfx-library'] ?? path.join(projectRoot, 'sfx-library'))),
  sfxVolume,
});

const proofFrame = path.join(finalDir, `${itemId}-competitive-preview-proof-frame.jpg`);
run('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-ss',
  '1',
  '-i',
  outPath,
  '-frames:v',
  '1',
  proofFrame,
]);

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  item_id: itemId,
  title: listing.title ?? blueprint.listing?.title ?? null,
  blueprint: blueprintPath,
  project_dir: projectDir,
  final_video: outPath,
  proof_frame: proofFrame,
  duration_seconds: ffprobeDuration(outPath),
  width,
  height,
  fps,
  selected_reference: blueprint.selected_reference ?? null,
  source_policy: 'structure-only competitor analysis; final video uses listing images, local/cleared B-roll if present, local music, and local SFX',
  audio_plan: audio.planPath,
  shots: renderedSegments.map((shot) => ({
    role: shot.role,
    start_seconds: shot.start,
    end_seconds: shot.end,
    duration_seconds: shot.duration,
    source_kind: shot.source_kind,
    source_file: shot.source_file,
    caption: shot.caption,
  })),
};
const manifestPath = path.join(finalDir, `${itemId}-competitive-preview-manifest.json`);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Competitive preview ad: ${outPath}`);
console.log(`Proof frame: ${proofFrame}`);
console.log(`Manifest: ${manifestPath}`);
