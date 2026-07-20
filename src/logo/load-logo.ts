import type {Box, LogoLayer, LogoModel} from './types';

type RawLogo = {
  slug: string;
  viewBox: string;
  width: number;
  height: number;
  brand: LogoModel['brand'];
  defs: string;
  layers: LogoLayer[];
};

/**
 * Wraps a raw layers.json into the LogoModel that variants consume.
 *
 * The accessors are deliberately forgiving: a variant written for ListingOS must
 * not crash when applied to a brand with no `card` layer. `layer()` returns null,
 * and `pivot()` falls back to canvas centre.
 */
export const createLogoModel = (raw: RawLogo): LogoModel => {
  const index = new Map(raw.layers.map((l) => [l.id, l]));

  const layer = (id: string): LogoLayer | null => index.get(id) ?? null;

  const byRole = (role: string): LogoLayer[] =>
    raw.layers.filter((l) => l.role === role);

  const pivot = (id: string): {x: number; y: number} => {
    const box: Box | null = layer(id)?.box ?? null;
    if (!box) {
      return {x: raw.width / 2, y: raw.height / 2};
    }
    return {x: box.x + box.w / 2, y: box.y + box.h / 2};
  };

  return {
    slug: raw.slug,
    viewBox: raw.viewBox,
    width: raw.width,
    height: raw.height,
    brand: raw.brand,
    defs: raw.defs,
    layers: raw.layers,
    layer,
    byRole,
    pivot,
  };
};

/** Convenience for variants: `transformOrigin` string for a layer. */
export const originOf = (logo: LogoModel, id: string): string => {
  const p = logo.pivot(id);
  return `${p.x}px ${p.y}px`;
};

/** Rough path length, good enough to seed stroke-dasharray draw-on animations. */
export const approxPathLength = (d: string): number => {
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  let len = 0;
  for (let i = 2; i + 1 < nums.length; i += 2) {
    const dx = nums[i] - nums[i - 2];
    const dy = nums[i + 1] - nums[i - 1];
    len += Math.hypot(dx, dy);
  }
  return len || 100;
};
