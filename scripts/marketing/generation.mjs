import fs from 'node:fs';
import crypto from 'node:crypto';

import {hashValue} from '../platform/catalog.mjs';

export const generationKey = (intent, capabilityFingerprint) =>
  hashValue({intent, adapterVersion: '2', capabilityFingerprint});

export const parseSubmissionResult = (stdout) => {
  try {
    const output = stdout.trim();
    const result = output ? JSON.parse(output.split('\n').at(-1)) : {submitted: true};
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new Error('Expected a provider job object.');
    return result;
  } catch {
    throw new Error(
      'SUBMISSION_UNCERTAIN: inspect the provider job before retrying; automatic resubmission is blocked.',
    );
  }
};

export const artifactMatchesFile = (asset) => {
  try {
    return (
      crypto.createHash('sha256').update(fs.readFileSync(asset.path)).digest('hex') === asset.hash
    );
  } catch {
    // Missing or unreadable media cannot satisfy an artifact integrity check.
    return false;
  }
};

export const generationAssetsReady = (variant, assets, capabilityFingerprint) =>
  variant.intents
    .filter((intent) => intent.type === 'generation')
    .every((intent) => {
      const key = generationKey(intent, capabilityFingerprint);
      return assets.some((asset) => {
        if (
          asset.type !== 'generated' ||
          asset.provenance.variantId !== variant.id ||
          asset.provenance.generationKey !== key
        )
          return false;
        return artifactMatchesFile(asset);
      });
    });
