import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fal} from '@fal-ai/client';

const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export const isRemoteUrl = (value) => /^https:\/\//i.test(String(value ?? ''));

export const sha256File = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export const uploadImageReference = async (source) => {
  const value = String(source ?? '').trim();
  if (!value) throw new Error('Image source cannot be empty.');
  if (isRemoteUrl(value)) return {source: value, reference_url: value, sha256: null, bytes: null};

  const file = path.resolve(value);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Image source not found: ${file}`);
  }
  const extension = path.extname(file).toLowerCase();
  const mimeType = mimeTypes[extension];
  if (!mimeType) throw new Error(`Unsupported image type for ${file}. Use PNG, JPEG, or WebP.`);

  const content = fs.readFileSync(file);
  const referenceUrl = await fal.storage.upload(new File([content], path.basename(file), {type: mimeType}));
  return {
    source: file,
    reference_url: referenceUrl,
    sha256: createHash('sha256').update(content).digest('hex'),
    bytes: content.length,
  };
};

export const downloadRemoteFile = async (url, output) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download generated media (${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('Generated media download was empty.');
  fs.writeFileSync(output, bytes);
  return {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
};
