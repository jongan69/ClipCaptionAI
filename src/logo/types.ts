/**
 * Contract shared by the harness and every generated animation variant.
 *
 * The whole point: a variant never knows WHICH logo it is animating. It only
 * knows there are named layers with boxes and paint. That is what makes a
 * variant reusable across brands — generate once, apply to every future logo.
 */

export type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LogoLayer = {
  /** Stable semantic id, e.g. "brackets", "l-mark", "card", "wordmark". */
  id: string;
  /** What the layer means, e.g. "scan-frame", "letterform", "text". */
  role: string;
  /** Approximate bounding box in viewBox units. Null for non-geometric layers. */
  box: Box | null;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number | null;
  /** Ids of addressable children inside this layer. */
  children: string[];
  /** Raw data-* attributes from the source SVG. */
  data: Record<string, string>;
  /** The layer's original SVG markup, ready to inject. */
  markup: string;
};

export type LogoModel = {
  slug: string;
  viewBox: string;
  width: number;
  height: number;
  brand: {
    name: string;
    wordmark?: {text: string; accentText?: string; accentSplitIndex?: number} | null;
    palette: Record<string, string>;
    fonts?: Record<string, string | number>;
    notes?: string;
  };
  /** <defs> block (gradients, clip paths) that layer markup references. */
  defs: string;
  layers: LogoLayer[];
  /** Returns null rather than throwing when a brand lacks the layer. */
  layer: (id: string) => LogoLayer | null;
  /** All layers matching a role, e.g. every "text" layer. */
  byRole: (role: string) => LogoLayer[];
  /** Centre point of a layer, falling back to canvas centre. */
  pivot: (id: string) => {x: number; y: number};
};

export type LogoVariantProps = {
  logo: LogoModel;
  frame: number;
  fps: number;
  width: number;
  height: number;
};

export type LogoVariantMeta = {
  id: string;
  name: string;
  durationInFrames: number;
  description: string;
};

export type LogoVariantModule = {
  meta: LogoVariantMeta;
  default: React.ComponentType<LogoVariantProps>;
};
