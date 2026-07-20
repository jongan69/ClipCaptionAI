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
  node scripts/render-ebay-photo-ad.mjs --project-dir outputs/.../398155636462 --voiceover voiceover.mp3

Options:
  --project-dir DIR        Listing project folder with listing.json and product photos.
  --voiceover FILE         Voiceover MP3/WAV to mix above the music bed.
  --out FILE               Output MP4. Default: project-dir/final/<item-id>-photo-ad.mp4
  --music-track FILE       Optional quiet background music.
  --music-volume N         Default: 0.035
  --duration N             Override duration seconds. Default: voice duration clamped to 11-16s.
  --width N                Default: 1080
  --height N               Default: 1920
  --fps N                  Default: 30
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const requireArg = (key) => {
  if (!args[key]) throw new Error(`Missing --${key}.\n${usage}`);
  return String(args[key]);
};

const projectDir = path.resolve(requireArg('project-dir'));
const voiceoverPath = path.resolve(requireArg('voiceover'));
const width = Number(args.width ?? 1080);
const height = Number(args.height ?? 1920);
const fps = Number(args.fps ?? 30);
const musicVolume = Number(args['music-volume'] ?? 0.035);
const listing = JSON.parse(fs.readFileSync(path.join(projectDir, 'listing.json'), 'utf8'));
const itemId = String(listing.item_id ?? listing.itemId ?? path.basename(projectDir));
const finalDir = path.join(projectDir, 'final');
const workDir = path.join(projectDir, 'outputs', `photo-ad-${timestampSlug()}`);
ensureDir(finalDir);
ensureDir(workDir);

const outPath = path.resolve(String(args.out ?? path.join(finalDir, `${itemId}-photo-ad.mp4`)));
const musicTrack = args['music-track']
  ? path.resolve(String(args['music-track']))
  : path.join(projectRoot, 'music-library', 'lofi-house', '01-dmca-free-lofi-chilled-beats.mp3');

const ffprobeDuration = (file) => {
  const raw = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
    {encoding: 'utf8'},
  ).trim();
  const duration = Number(raw);
  return Number.isFinite(duration) ? duration : 0;
};

const imageFiles = fs
  .readdirSync(projectDir)
  .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
  .sort((a, b) => a.localeCompare(b))
  .map((name) => path.join(projectDir, name));

if (imageFiles.length === 0) {
  throw new Error(`No product images found in ${projectDir}`);
}

if (!fs.existsSync(voiceoverPath)) {
  throw new Error(`Voiceover not found: ${voiceoverPath}`);
}

const voiceDuration = ffprobeDuration(voiceoverPath);
const duration = Number(args.duration ?? Math.min(16, Math.max(11, voiceDuration + 0.35)));
const selectedImages = imageFiles.slice(0, Math.min(6, Math.max(3, imageFiles.length)));
const segmentDuration = duration / selectedImages.length;
const framesPerSegment = Math.max(1, Math.round(segmentDuration * fps));

const run = (cmd, cmdArgs) => {
  execFileSync(cmd, cmdArgs, {stdio: 'inherit'});
};

const segmentFiles = selectedImages.map((image, index) => {
  const segmentPath = path.join(workDir, `${String(index + 1).padStart(2, '0')}.mp4`);
  const zoomDirection = index % 2 === 0 ? '+' : '-';
  const zoomExpr =
    zoomDirection === '+'
      ? `min(1.08,1+0.055*on/${framesPerSegment})`
      : `max(1.0,1.055-0.055*on/${framesPerSegment})`;
  run('ffmpeg', [
    '-y',
    '-v',
    'warning',
    '-loop',
    '1',
    '-i',
    image,
    '-t',
    segmentDuration.toFixed(3),
    '-vf',
    `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,zoompan=z='${zoomExpr}':d=${framesPerSegment}:s=${width}x${height}:fps=${fps},fade=t=in:st=0:d=0.15,fade=t=out:st=${Math.max(0, segmentDuration - 0.18).toFixed(3)}:d=0.18,format=yuv420p`,
    '-r',
    String(fps),
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    segmentPath,
  ]);
  return segmentPath;
});

const concatFile = path.join(workDir, 'segments.txt');
fs.writeFileSync(concatFile, segmentFiles.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n') + '\n');
const baseVideo = path.join(workDir, `${itemId}-base.mp4`);
run('ffmpeg', [
  '-y',
  '-v',
  'warning',
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  concatFile,
  '-c',
  'copy',
  baseVideo,
]);

const captionPlan = [
  {start: 0.15, end: 1.9, lines: ['STOP SCROLLING'], size: 96},
  {start: 1.9, end: 4.2, lines: captionLinesForListing(listing, 0), size: 78},
  {start: 4.2, end: 7.0, lines: captionLinesForListing(listing, 1), size: 72},
  {start: 7.0, end: 9.9, lines: captionLinesForListing(listing, 2), size: 74},
  {start: 9.9, end: 12.2, lines: ['Real photos.', listing.title?.includes('Kobe') ? 'Real slab.' : 'Real gear.'], size: 82},
  {start: 12.2, end: duration - 0.1, lines: ['GRAB IT ON EBAY'], size: 90},
].filter((item) => item.start < duration && item.end > item.start);

const captionsDir = path.join(workDir, 'captions');
ensureDir(captionsDir);
const captionSpecPath = path.join(workDir, 'caption-spec.json');
fs.writeFileSync(captionSpecPath, `${JSON.stringify({width, height, captionsDir, captionPlan}, null, 2)}\n`);

run('python3', [
  '-c',
  String.raw`
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
spec=json.load(open(__import__('sys').argv[1]))
W,H=spec['width'],spec['height']
out=Path(spec['captionsDir']); out.mkdir(parents=True, exist_ok=True)
font_candidates=[
 '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
 '/System/Library/Fonts/Supplemental/Arial.ttf',
 '/System/Library/Fonts/SFNS.ttf',
]
def font(size):
 for p in font_candidates:
  try: return ImageFont.truetype(p,size)
  except Exception: pass
 return ImageFont.load_default()
for idx,item in enumerate(spec['captionPlan'], start=1):
 img=Image.new('RGBA',(W,H),(0,0,0,0))
 d=ImageDraw.Draw(img)
 f=font(item['size'])
 lines=item['lines']
 gap=18
 bboxes=[d.textbbox((0,0), line, font=f) for line in lines]
 widths=[b[2]-b[0] for b in bboxes]
 heights=[b[3]-b[1] for b in bboxes]
 text_h=sum(heights)+gap*(len(lines)-1)
 pad_x=48; pad_y=34
 box_w=max(widths)+pad_x*2
 box_h=text_h+pad_y*2
 x=(W-box_w)//2
 y=H-220-box_h
 try:
  d.rounded_rectangle([x,y,x+box_w,y+box_h], radius=24, fill=(0,0,0,150))
 except Exception:
  d.rectangle([x,y,x+box_w,y+box_h], fill=(0,0,0,150))
 cy=y+pad_y
 for line,w,h in zip(lines,widths,heights):
  tx=(W-w)//2
  d.text((tx,cy), line, font=f, fill=(255,255,255,255), stroke_width=5, stroke_fill=(10,10,10,235))
  cy += h+gap
 img.save(out/f'{idx:02d}.png')
`,
  captionSpecPath,
]);

const inputs = ['-i', baseVideo, '-i', voiceoverPath];
captionPlan.forEach((_, index) => {
  inputs.push('-loop', '1', '-t', duration.toFixed(3), '-i', path.join(captionsDir, `${String(index + 1).padStart(2, '0')}.png`));
});
const hasMusic = fs.existsSync(musicTrack);
if (hasMusic) {
  inputs.push('-stream_loop', '-1', '-i', musicTrack);
}

let videoFilter = '[0:v]';
captionPlan.forEach((item, index) => {
  const inputIndex = index + 2;
  const outLabel = index === captionPlan.length - 1 ? '[vout]' : `[v${index + 1}]`;
  videoFilter += `[${inputIndex}:v]overlay=0:0:enable='between(t,${item.start.toFixed(2)},${item.end.toFixed(2)})'${outLabel};`;
  videoFilter = index === captionPlan.length - 1 ? videoFilter : videoFilter;
  if (index < captionPlan.length - 1) {
    videoFilter += `[v${index + 1}]`;
  }
});

const musicInputIndex = 2 + captionPlan.length;
const audioFilter = hasMusic
  ? `[1:a]volume=1.28,asplit=2[vo_sc][vo_mix];[${musicInputIndex}:a]aformat=channel_layouts=stereo,atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${musicVolume}[music];[music][vo_sc]sidechaincompress=threshold=0.018:ratio=7:attack=8:release=240[ducked];[ducked][vo_mix]amix=inputs=2:duration=first:normalize=0,atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS[aout]`
  : `[1:a]volume=1.28,atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS[aout]`;

run('ffmpeg', [
  '-y',
  '-v',
  'warning',
  ...inputs,
  '-filter_complex',
  `${videoFilter}${audioFilter}`,
  '-map',
  '[vout]',
  '-map',
  '[aout]',
  '-t',
  duration.toFixed(3),
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-crf',
  '18',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '192k',
  '-movflags',
  '+faststart',
  '-map_metadata',
  '-1',
  '-dn',
  outPath,
]);

const manifest = {
  item_id: itemId,
  title: listing.title,
  mode: 'local_product_photo_motion_ad',
  source_images: selectedImages,
  voiceover: voiceoverPath,
  music_track: hasMusic ? musicTrack : null,
  duration_seconds: ffprobeDuration(outPath),
  output_video: outPath,
  work_dir: workDir,
  created_at: new Date().toISOString(),
};
fs.writeFileSync(path.join(finalDir, `${itemId}-photo-ad-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Photo ad: ${outPath}`);

function captionLinesForListing(currentListing, slot) {
  const title = String(currentListing.title ?? '');
  if (/Kobe/i.test(title)) {
    return [
      ['1996 Upper Deck SP', 'Kobe Bryant'],
      ['PSA 8 graded', 'Lakers collectible'],
      ['Protected slab', 'collector ready'],
    ][slot];
  }
  if (/Projector|Fudoni/i.test(title)) {
    return [
      ['Fudoni projector', 'remote included'],
      ['Home movie setup', 'easy to place'],
      ['Bedroom, backyard', 'living room ready'],
    ][slot];
  }
  if (/RS 4 Mini|Gimbal/i.test(title)) {
    return [
      ['DJI RS 4 Mini', 'creator gimbal'],
      ['SmallRig handle', 'tracker module'],
      ['Cleaner handheld', 'camera moves'],
    ][slot];
  }
  if (/Avata/i.test(title)) {
    return [
      ['DJI Avata FPV', 'open box kit'],
      ['Smart controller', 'Insta360 lens'],
      ['Immersive flying', 'action shots'],
    ][slot];
  }
  if (/solar|fan/i.test(title)) {
    return [
      ['Solar USB fan', 'LED light'],
      ['Carry handle', 'portable setup'],
      ['Desk, camping', 'outage ready'],
    ][slot];
  }
  if (/money bag|neon/i.test(title)) {
    return [
      ['Money bag neon', 'USB wall light'],
      ['Yellow green glow', 'room accent'],
      ['Desk, studio', 'reseller vibe'],
    ][slot];
  }
  if (/Yeezy/i.test(title)) {
    return [
      ['Yeezy Boost 350 V2', "men's US 10"],
      ['Black gray low top', 'real photos'],
      ['Clean sneaker find', 'ready to grab'],
    ][slot];
  }
  if (/Brahma|work boots/i.test(title)) {
    return [
      ['Brahma work boots', "men's 9.5"],
      ['Waterproof leather', 'lace up pair'],
      ['Rugged daily', 'workwear ready'],
    ][slot];
  }
  if (/E11EVEN|trucker/i.test(title)) {
    return [
      ['E11EVEN Miami', 'mesh trucker hat'],
      ['One size unisex', 'black cap'],
      ['Miami energy', 'easy everyday wear'],
    ][slot];
  }
  if (/Geek Squad|polo/i.test(title)) {
    return [
      ['Geek Squad polo', "men's medium"],
      ['Black yellow', 'embroidered logo'],
      ['Tech nostalgia', 'collector piece'],
    ][slot];
  }
  if (/Perry Ellis|Oxford|dress shoes/i.test(title)) {
    return [
      ['Perry Ellis oxfords', "men's size 9"],
      ['Brown dress shoes', 'sharp pair'],
      ['Work, events', 'dress up ready'],
    ][slot];
  }
  if (/Meepo|Longboard|Wheels/i.test(title)) {
    return [
      ['Meepo Sentry wheels', 'set of four'],
      ['90mm 78A', 'white parts'],
      ['Repair, refresh', 'board ready'],
    ][slot];
  }
  if (/GYMREAPERS|drawstring/i.test(title)) {
    return [
      ['Gymreapers bag', 'small drawstring'],
      ['Black white', 'skull logo'],
      ['Gym gear', 'everyday carry'],
    ][slot];
  }
  if (/adidas.*Boost/i.test(title)) {
    return [
      ['adidas Boost', "men's US 10"],
      ['Black low top', 'fair condition'],
      ['Real photos', 'know the pair'],
    ][slot];
  }
  if (/sling|crossbody/i.test(title)) {
    return [
      ['Brown leather sling', 'crossbody bag'],
      ['Adjustable strap', 'zip pockets'],
      ['Compact carry', 'real condition'],
    ][slot];
  }
  return [
    ['Clean listing', 'ready to ship'],
    ['Details shown', 'real photos'],
    ['Buy with confidence', 'on eBay'],
  ][slot];
}
