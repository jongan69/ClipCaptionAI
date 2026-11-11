import {artifactMatchesFile, generationKey} from './generation.mjs';
import {copyAsset} from './assets.mjs';

export const requireGenerationBindings = (variant) => {
  const paths = new Set([...variant.timeline, ...variant.slides].map((entry) => entry.src));
  for (const intent of variant.intents.filter((entry) => entry.type === 'generation')) {
    if (!intent.output || !paths.has(intent.output))
      throw new Error(
        `GENERATION_OUTPUT_UNBOUND: ${variant.id} must reference each generation output in its timeline or slides.`,
      );
  }
};

export const bindVariantMedia = (state, variant, assets) => {
  const bind = (source) => {
    if (!source) return undefined;
    const generation = variant.intents.find(
      (intent) => intent.type === 'generation' && intent.output === source,
    );
    let asset = assets.findLast(
      (entry) =>
        entry.provenance.variantId === variant.id &&
        entry.provenance.sourcePath === source &&
        (!generation ||
          (entry.type === 'generated' &&
            entry.provenance.generationKey ===
              generationKey(generation, state.plan.capabilityFingerprint))),
    );
    if (!asset && generation) throw new Error(`GENERATION_ASSET_REQUIRED: ${source}`);
    if (!asset) {
      asset = copyAsset(state, variant, {type: 'source', source}, source, 'source');
      assets.push(asset);
    }
    if (!artifactMatchesFile(asset)) throw new Error(`ARTIFACT_HASH_MISMATCH: ${asset.path}`);
    return asset.path;
  };
  return {
    ...variant,
    timeline: variant.timeline.map((entry) => ({...entry, src: bind(entry.src)})),
    slides: variant.slides.map((entry) => ({...entry, src: bind(entry.src)})),
    voice: bind(variant.voice),
    music: bind(variant.music),
  };
};
