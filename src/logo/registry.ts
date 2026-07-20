import listingosLayers from '../../assets/logos/listingos/layers.json';
import {createLogoModel} from './load-logo';
import type {LogoModel, LogoVariantMeta, LogoVariantProps} from './types';

import scanIn, {meta as scanInMeta} from './variants/01-scan-in';
import assemble, {meta as assembleMeta} from './variants/02-assemble';
import cardDeal, {meta as cardDealMeta} from './variants/03-card-deal';
import maskWipe, {meta as maskWipeMeta} from './variants/04-mask-wipe';
import depthParallax, {meta as depthParallaxMeta} from './variants/05-depth-parallax';
import letterCascade, {meta as letterCascadeMeta} from './variants/06-letter-cascade';
import liquidMorph, {meta as liquidMorphMeta} from './variants/07-liquid-morph';
import glitchResolve, {meta as glitchResolveMeta} from './variants/08-glitch-resolve';
import bracketPulse, {meta as bracketPulseMeta} from './variants/09-bracket-pulse';
import gradientSweep, {meta as gradientSweepMeta} from './variants/10-gradient-sweep';
import orbitalSpin, {meta as orbitalSpinMeta} from './variants/11-orbital-spin';
import cornerRush, {meta as cornerRushMeta} from './variants/12-corner-rush';
import scanlineRail, {meta as scanlineRailMeta} from './variants/13-scanline-rail';
import waveRipple, {meta as waveRippleMeta} from './variants/14-wave-ripple';
import haloDrift, {meta as haloDriftMeta} from './variants/15-halo-drift';

/**
 * BRANDS — add one line per logo.
 *
 * To onboard a new logo:
 *   1. node scripts/logo/vectorize.mjs --in <png> --slug <slug>   (skip if you have vector)
 *   2. rename layer ids -> assets/logos/<slug>/logo.svg
 *   3. node scripts/logo/build-spec.mjs --slug <slug>
 *   4. import its layers.json here
 *
 * Every existing variant then works on it for free — no regeneration needed.
 */
export const brands: Record<string, LogoModel> = {
  listingos: createLogoModel(listingosLayers as never),
};

/**
 * VARIANTS — generated animations. Codex Spark appends to this list.
 * Static imports are required; Remotion's bundler cannot follow dynamic ones.
 */
export const variants: {
  meta: LogoVariantMeta;
  component: React.ComponentType<LogoVariantProps>;
}[] = [
  {meta: scanInMeta, component: scanIn},
  {meta: assembleMeta, component: assemble},
  {meta: cardDealMeta, component: cardDeal},
  {meta: maskWipeMeta, component: maskWipe},
  {meta: depthParallaxMeta, component: depthParallax},
  {meta: letterCascadeMeta, component: letterCascade},
  {meta: liquidMorphMeta, component: liquidMorph},
  {meta: glitchResolveMeta, component: glitchResolve},
  {meta: bracketPulseMeta, component: bracketPulse},
  {meta: gradientSweepMeta, component: gradientSweep},
  {meta: orbitalSpinMeta, component: orbitalSpin},
  {meta: cornerRushMeta, component: cornerRush},
  {meta: scanlineRailMeta, component: scanlineRail},
  {meta: waveRippleMeta, component: waveRipple},
  {meta: haloDriftMeta, component: haloDrift},
];

/** Every brand x variant pair, used to register Remotion compositions. */
export const compositionMatrix = () =>
  Object.entries(brands).flatMap(([slug, logo]) =>
    variants.map((v) => ({
      id: `Logo-${slug}-${v.meta.id}`,
      slug,
      logo,
      ...v,
    }))
  );
