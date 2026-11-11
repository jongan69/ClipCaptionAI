import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hashValue} from '../platform/catalog.mjs';
import {AssetRecord} from './schemas.mjs';
import {now, fileHash} from './runtime.mjs';

export const copyAsset = (state, variant, intent, source, type, extra = {}) => {
  if (!fs.existsSync(source)) throw new Error(`Asset source not found: ${source}`);
  const hash = fileHash(source);
  const extension = path.extname(source);
  const target = path.join(
    state.directory,
    'artifacts',
    type,
    `${variant.id}${extra.slideIndex ? `-slide-${String(extra.slideIndex).padStart(2, '0')}` : ''}-${hash.slice(0, 12)}${extension}`,
  );
  if (!fs.existsSync(target)) fs.copyFileSync(source, target);
  if (fileHash(target) !== hash) throw new Error(`ARTIFACT_HASH_MISMATCH: ${target}`);
  const adapter =
    type === 'source'
      ? 'filesystem'
      : type === 'mockups'
        ? 'rotato'
        : type === 'generated'
          ? 'higgsfield'
          : 'capture';
  const adapterVersion = extra.adapterVersion || '1';
  const idempotencyKey = hashValue({
    intent,
    inputHashes: [hash],
    adapterVersion,
    provider: intent.provider,
    model: intent.model,
    capabilityFingerprint: state.plan.capabilityFingerprint,
  });
  const mediaResult = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', target],
    {encoding: 'utf8', shell: false},
  );
  return AssetRecord.parse({
    id: `${variant.id}-${idempotencyKey.slice(0, 12)}`,
    type,
    path: target,
    hash: fileHash(target),
    createdAt: now(),
    provenance: {
      variantId: variant.id,
      sourcePath: path.resolve(source),
      idempotencyKey,
      adapter,
      adapterVersion,
      timelineHash: hashValue(variant.timeline),
      ...extra,
    },
    media: mediaResult.status === 0 ? JSON.parse(mediaResult.stdout) : undefined,
  });
};
