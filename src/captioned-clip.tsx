import {createTikTokStyleCaptions} from '@remotion/captions';
import type {Caption} from '@remotion/captions';
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {useMemo} from 'react';
import type {CSSProperties} from 'react';
import type {
  CaptionedClipProps,
  CaptionMotionKeyframe,
  CaptionMotionPreset,
  CaptionPosition,
  CaptionStyle,
} from './types';

export const captionedClipDefaultProps: CaptionedClipProps = {
  videoSrc: '',
  foregroundSrc: null,
  captions: [],
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 450,
  style: {
    position: 'left-hook',
    fit: 'cover',
    videoFilter: null,
    videoBorderRadius: 0,
    combineTokensWithinMilliseconds: 420,
    captionLayout: 'stacked',
    motionPreset: 'static',
    motionKeyframes: [],
    visibleTokensBefore: 1,
    visibleTokensAfter: 0,
    textColor: '#ffffff',
    textOpacity: 0.92,
    visibleTextLayerEnabled: true,
    normalTextOpacityMultiplier: 1,
    highlightTextOpacityMultiplier: 1,
    effectLayerEnabled: false,
    effectTextOpacityMultiplier: 0.55,
    effectHighlightTextOpacityMultiplier: 0.62,
    shadowColor: 'rgba(0, 0, 0, 0.55)',
    normalFontFamily:
      '"Arial Rounded MT Bold", "Avenir Next", "Arial Black", sans-serif',
    highlightFontFamily:
      '"Snell Roundhand", "Apple Chancery", "Savoye LET", "Brush Script MT", "Bodoni 72", "Didot", cursive',
    normalFontWeight: 950,
    highlightFontWeight: 400,
    normalFontStyle: 'normal',
    highlightFontStyle: 'italic',
    baseFontSizeRatio: 0.086,
    minFontSize: 42,
    lineHeight: 0.82,
    gapRatio: 0.05,
    letterSpacing: 0,
    maxCaptionWidth: '90%',
    highlightScale: 1.62,
    activePopStartScale: 0.72,
    normalStrokeRatio: 0.045,
    highlightStrokeRatio: 0.012,
    minStrokePx: 1,
    normalStrokeColor: 'rgba(0, 0, 0, 0.45)',
    highlightStrokeColor: 'rgba(0, 0, 0, 0.18)',
    backgroundOverlay:
      'linear-gradient(90deg, rgba(0,0,0,0.24), rgba(0,0,0,0.02) 42%, rgba(0,0,0,0))',
    isolateBlendMode: true,
    activeScale: 1,
    inactiveScale: 0.62,
    uppercase: false,
    highlightedWords: [],
  },
};

const positionStyle = (position: CaptionPosition): CSSProperties => {
  if (position === 'center-bottom') {
    return {
      left: '8%',
      right: '8%',
      bottom: '12%',
      alignItems: 'center',
      textAlign: 'center',
    };
  }

  if (position === 'center-impact') {
    return {
      left: '5%',
      right: '5%',
      top: '48%',
      transform: 'translateY(-50%)',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
    };
  }

  if (position === 'lower-left') {
    return {
      left: '9%',
      right: '18%',
      bottom: '18%',
      alignItems: 'flex-start',
      textAlign: 'left',
    };
  }

  if (position === 'right-hook') {
    return {
      left: '42%',
      right: '10.5%',
      top: '49%',
      transform: 'translateY(-50%)',
      alignItems: 'flex-end',
      textAlign: 'right',
    };
  }

  return {
    left: '10.5%',
    right: '42%',
    top: '49%',
    transform: 'translateY(-50%)',
    alignItems: 'flex-start',
    textAlign: 'left',
  };
};

const transformOriginForPosition = (position: CaptionPosition) => {
  if (position === 'center-bottom') {
    return 'center';
  }

  if (position === 'center-impact') {
    return 'center';
  }

  if (position === 'right-hook') {
    return 'right center';
  }

  return 'left center';
};

const templateCss = (value: string | undefined, fontSize: number) =>
  value?.replaceAll('{fontSize}', `${fontSize}px`);

const normalizeToken = (text: string, uppercase: boolean) => {
  const cleaned = text.trim();
  return uppercase ? cleaned.toUpperCase() : cleaned;
};

const tokenKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

const weakWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'if',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'so',
  'that',
  'the',
  'this',
  'to',
  'was',
  'we',
  'with',
  'you',
  'your',
]);

const getStrongestTokenKey = (tokens: {text: string}[]) => {
  const candidates = tokens
    .map((token) => tokenKey(token.text))
    .filter((key) => key.length > 2 && !weakWords.has(key));

  return candidates.sort((a, b) => b.length - a.length)[0] ?? '';
};

const colorWithOpacity = (color: string, opacity: number) => {
  const clamped = Math.max(0, Math.min(1, opacity));
  const hex = color.match(/^#([0-9a-f]{6})$/i);

  if (!hex) {
    return color;
  }

  const value = hex[1];
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${clamped})`;
};

const stringOrUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const mixBlendModeOrUndefined = (value: unknown) => {
  const resolved = stringOrUndefined(value);
  return resolved as CSSProperties['mixBlendMode'] | undefined;
};

const clampTokenCount = (value: number | undefined, fallback: number) =>
  Math.max(0, Math.min(8, Math.floor(Number(value ?? fallback))));

const clampProgress = (value: number) => Math.max(0, Math.min(1, value));

const motionPresetKeyframes = (
  preset: CaptionMotionPreset | undefined,
): CaptionMotionKeyframe[] => {
  if (preset === 'center-pop') {
    return [
      {at: 0, scale: 0.78, opacity: 0},
      {at: 0.14, scale: 1.14, opacity: 1},
      {at: 1, scale: 1, opacity: 1},
    ];
  }

  if (preset === 'center-to-left') {
    return [
      {at: 0, xPercent: 0, yPercent: 0, scale: 1.12, opacity: 0},
      {at: 0.18, xPercent: 0, yPercent: 0, scale: 1.06, opacity: 1},
      {at: 0.58, xPercent: -24, yPercent: 0, scale: 0.9, opacity: 0.98},
      {at: 1, xPercent: -24, yPercent: 0, scale: 0.9, opacity: 0.98},
    ];
  }

  if (preset === 'center-to-right') {
    return [
      {at: 0, xPercent: 0, yPercent: 0, scale: 1.12, opacity: 0},
      {at: 0.18, xPercent: 0, yPercent: 0, scale: 1.06, opacity: 1},
      {at: 0.58, xPercent: 24, yPercent: 0, scale: 0.9, opacity: 0.98},
      {at: 1, xPercent: 24, yPercent: 0, scale: 0.9, opacity: 0.98},
    ];
  }

  if (preset === 'float') {
    return [
      {at: 0, xPercent: -1, yPercent: 1, scale: 1, opacity: 0.98},
      {at: 0.5, xPercent: 1.4, yPercent: -1.2, scale: 1.03, opacity: 1},
      {at: 1, xPercent: -0.6, yPercent: 0.8, scale: 1, opacity: 0.98},
    ];
  }

  return [{at: 0, xPercent: 0, yPercent: 0, scale: 1, opacity: 1, rotateDeg: 0}];
};

const sortedMotionKeyframes = (style: CaptionStyle) => {
  const configured = style.motionKeyframes?.filter((keyframe) =>
    Number.isFinite(Number(keyframe.at)),
  );
  const keyframes =
    configured && configured.length > 0
      ? configured
      : motionPresetKeyframes(style.motionPreset);

  return keyframes
    .map((keyframe) => ({...keyframe, at: clampProgress(Number(keyframe.at))}))
    .sort((a, b) => a.at - b.at);
};

const interpolateMotionValue = (
  keyframes: CaptionMotionKeyframe[],
  progress: number,
  field: keyof CaptionMotionKeyframe,
  fallback: number,
) => {
  const firstWithField = keyframes.find(
    (keyframe) => keyframe[field] !== undefined,
  );

  if (!firstWithField) {
    return fallback;
  }

  let previous = {...firstWithField, at: 0};
  let next = {...firstWithField, at: 1};

  for (const keyframe of keyframes) {
    if (keyframe[field] === undefined) {
      continue;
    }

    if (keyframe.at <= progress) {
      previous = keyframe;
    }

    if (keyframe.at >= progress) {
      next = keyframe;
      break;
    }
  }

  if (previous.at === next.at) {
    return Number(previous[field] ?? fallback);
  }

  return interpolate(
    progress,
    [previous.at, next.at],
    [Number(previous[field]), Number(next[field])],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
};

const captionMotionStyle = (style: CaptionStyle, progress: number) => {
  const keyframes = sortedMotionKeyframes(style);
  const xPercent = interpolateMotionValue(keyframes, progress, 'xPercent', 0);
  const yPercent = interpolateMotionValue(keyframes, progress, 'yPercent', 0);
  const scale = interpolateMotionValue(keyframes, progress, 'scale', 1);
  const opacity = interpolateMotionValue(keyframes, progress, 'opacity', 1);
  const rotateDeg = interpolateMotionValue(keyframes, progress, 'rotateDeg', 0);

  return {
    opacity,
    transform: `translate(${xPercent}vw, ${yPercent}vh) scale(${scale}) rotate(${rotateDeg}deg)`,
  };
};

const getActivePage = (
  captions: Caption[],
  currentMs: number,
  combineTokensWithinMilliseconds: number,
) => {
  const {pages} = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds,
  });

  return pages.find((page) => {
    const endMs = page.startMs + page.durationMs;
    return currentMs >= page.startMs && currentMs <= endMs + 80;
  });
};

type HorizontalAlign = 'left' | 'center' | 'right';

type LayoutToken = {
  key: string;
  label: string;
  x: number;
  y: number;
  rawWidth: number;
  rawHeight: number;
  width: number;
  height: number;
  scale: number;
  isHighlighted: boolean;
  textColor: string;
  fontFamily: string;
  fontStyle: string;
  fontWeight: number;
  strokePx: number;
  strokeColor: string;
  textShadow: string;
  dropShadow: string;
  blendMode?: CSSProperties['mixBlendMode'];
  filterCss?: string;
  letterSpacingPx: number;
};

type MotionMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

let measurementCanvas: HTMLCanvasElement | null = null;

const parseDimensionToPx = (
  value: string | number | undefined,
  total: number,
  fallback: number,
) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();

  if (trimmed.endsWith('%')) {
    const numeric = Number(trimmed.slice(0, -1));
    return Number.isFinite(numeric) ? (numeric / 100) * total : fallback;
  }

  if (trimmed.endsWith('px')) {
    const numeric = Number(trimmed.slice(0, -2));
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseLetterSpacingToPx = (
  value: string | number | undefined,
  fontSize: number,
) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return 0;
  }

  const trimmed = value.trim();

  if (trimmed.endsWith('em')) {
    const numeric = Number(trimmed.slice(0, -2));
    return Number.isFinite(numeric) ? numeric * fontSize : 0;
  }

  if (trimmed.endsWith('px')) {
    const numeric = Number(trimmed.slice(0, -2));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : 0;
};

const measureTextWidth = ({
  text,
  fontFamily,
  fontStyle,
  fontWeight,
  fontSize,
  letterSpacingPx,
}: {
  text: string;
  fontFamily: string;
  fontStyle: string;
  fontWeight: number;
  fontSize: number;
  letterSpacingPx: number;
}) => {
  if (typeof document === 'undefined') {
    return Math.max(
      fontSize * 0.7,
      text.length * fontSize * 0.6 + Math.max(0, text.length - 1) * letterSpacingPx,
    );
  }

  measurementCanvas ??= document.createElement('canvas');
  const context = measurementCanvas.getContext('2d');

  if (!context) {
    return Math.max(
      fontSize * 0.7,
      text.length * fontSize * 0.6 + Math.max(0, text.length - 1) * letterSpacingPx,
    );
  }

  context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  const measured = context.measureText(text).width;
  return measured + Math.max(0, text.length - 1) * letterSpacingPx;
};

const resolveHorizontalAlign = (
  style: CSSProperties,
  position: CaptionPosition,
): HorizontalAlign => {
  if (style.textAlign === 'center' || style.alignItems === 'center') {
    return 'center';
  }

  if (style.textAlign === 'right' || style.alignItems === 'flex-end') {
    return 'right';
  }

  if (position === 'center-bottom' || position === 'center-impact') {
    return 'center';
  }

  if (position === 'right-hook') {
    return 'right';
  }

  return 'left';
};

const buildMotionMatrix = ({
  originX,
  originY,
  translateX,
  translateY,
  scale,
  rotateDeg,
}: {
  originX: number;
  originY: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotateDeg: number;
}): MotionMatrix => {
  const radians = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(radians) * scale;
  const sin = Math.sin(radians) * scale;

  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: translateX + originX - originX * cos + originY * sin,
    f: translateY + originY - originX * sin - originY * cos,
  };
};

const matrixToCss = (matrix: MotionMatrix) =>
  `matrix(${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, ${matrix.e}, ${matrix.f})`;

const matrixToSvg = (matrix: MotionMatrix) =>
  `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`;

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const buildMaskDataUrl = ({
  width,
  height,
  tokens,
  fontSize,
  lineHeight,
  matrix,
}: {
  width: number;
  height: number;
  tokens: LayoutToken[];
  fontSize: number;
  lineHeight: number;
  matrix: MotionMatrix;
}) => {
  if (tokens.length === 0) {
    return null;
  }

  const tokenMarkup = tokens
    .map((token) => {
      return [
        `<g transform="translate(${token.x} ${token.y}) scale(${token.scale})">`,
        `<text x="0" y="0" fill="white" dominant-baseline="text-before-edge" xml:space="preserve" font-family="${escapeXml(
          token.fontFamily,
        )}" font-style="${escapeXml(token.fontStyle)}" font-weight="${token.fontWeight}" font-size="${fontSize}" letter-spacing="${token.letterSpacingPx}" line-height="${lineHeight}">${escapeXml(
          token.label,
        )}</text>`,
        '</g>',
      ].join('');
    })
    .join('');

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<g transform="${matrixToSvg(matrix)}">`,
    tokenMarkup,
    '</g>',
    '</svg>',
  ].join('');

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const CaptionedClip: React.FC<CaptionedClipProps> = ({
  videoSrc,
  foregroundSrc,
  captions,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const currentMs = (frame / fps) * 1000;
  const normalFontFamily =
    style.normalFontFamily ??
    '"Arial Rounded MT Bold", "Avenir Next", "Arial Black", sans-serif';
  const highlightFontFamily =
    style.highlightFontFamily ??
    '"Snell Roundhand", "Apple Chancery", "Savoye LET", "Brush Script MT", "Bodoni 72", "Didot", cursive';
  const normalFontWeight = style.normalFontWeight ?? 950;
  const highlightFontWeight = style.highlightFontWeight ?? 400;
  const normalFontStyle = style.normalFontStyle ?? 'normal';
  const highlightFontStyle = style.highlightFontStyle ?? 'italic';
  const videoSource = /^https?:\/\//.test(videoSrc)
    ? videoSrc
    : staticFile(videoSrc);
  const foregroundSource =
    foregroundSrc && /^https?:\/\//.test(foregroundSrc)
      ? foregroundSrc
      : foregroundSrc
        ? staticFile(foregroundSrc)
        : null;
  const highlightSet = useMemo(
    () => new Set((style.highlightedWords ?? []).map(tokenKey)),
    [style.highlightedWords],
  );

  const page = useMemo(
    () =>
      getActivePage(
        captions,
        currentMs,
        style.combineTokensWithinMilliseconds,
      ),
    [captions, currentMs, style.combineTokensWithinMilliseconds],
  );

  const activeTokenIndex = useMemo(() => {
    if (!page) {
      return -1;
    }

    const current = page.tokens.findIndex(
      (token) => currentMs >= token.fromMs && currentMs <= token.toMs + 90,
    );

    if (current !== -1) {
      return current;
    }

    for (let index = page.tokens.length - 1; index >= 0; index -= 1) {
      if (currentMs >= page.tokens[index].fromMs) {
        return index;
      }
    }

    return -1;
  }, [currentMs, page]);

  const visibleTokensBefore = clampTokenCount(style.visibleTokensBefore, 1);
  const visibleTokensAfter = clampTokenCount(style.visibleTokensAfter, 0);
  const visibleStartIndex =
    page && activeTokenIndex >= 0
      ? Math.max(activeTokenIndex - visibleTokensBefore, 0)
      : 0;
  const visibleTokens =
    page && activeTokenIndex >= 0
      ? page.tokens.slice(
          visibleStartIndex,
          activeTokenIndex + visibleTokensAfter + 1,
        )
      : [];
  const visibleHasExplicitKeyword = visibleTokens.some((token) =>
    highlightSet.has(tokenKey(token.text)),
  );
  const automaticKeywordKey = visibleHasExplicitKeyword
    ? ''
    : getStrongestTokenKey(visibleTokens);

  const baseFontSize = Math.max(
    style.minFontSize ?? 42,
    Math.min(width, height) * (style.baseFontSizeRatio ?? 0.086),
  );
  const entrance = interpolate(Math.min(frame / 8, 1), [0, 1], [0.92, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const captionLayout = style.captionLayout ?? 'stacked';
  const pageProgress =
    page && page.durationMs > 0
      ? clampProgress((currentMs - page.startMs) / page.durationMs)
      : 0;
  const containerPositionStyle = {
    ...positionStyle(style.position),
    ...(style.customPosition ?? {}),
  };
  const motionValues = useMemo(() => {
    const keyframes = sortedMotionKeyframes(style);
    return {
      xPx:
        (interpolateMotionValue(keyframes, pageProgress, 'xPercent', 0) / 100) * width,
      yPx:
        (interpolateMotionValue(keyframes, pageProgress, 'yPercent', 0) / 100) * height,
      scale: interpolateMotionValue(keyframes, pageProgress, 'scale', 1),
      opacity: interpolateMotionValue(keyframes, pageProgress, 'opacity', 1),
      rotateDeg: interpolateMotionValue(keyframes, pageProgress, 'rotateDeg', 0),
    };
  }, [height, pageProgress, style, width]);

  const layout = useMemo(() => {
    if (visibleTokens.length === 0) {
      return {
        tokens: [] as LayoutToken[],
        normalMaskUrl: null as string | null,
        highlightMaskUrl: null as string | null,
      };
    }

    const lineHeight = style.lineHeight ?? 0.82;
    const gapPx = baseFontSize * (style.gapRatio ?? 0.05);
    const letterSpacingPx = parseLetterSpacingToPx(style.letterSpacing, baseFontSize);
    const leftPx = parseDimensionToPx(
      containerPositionStyle.left as string | number | undefined,
      width,
      width * 0.1,
    );
    const rightPx = parseDimensionToPx(
      containerPositionStyle.right as string | number | undefined,
      width,
      width * 0.1,
    );
    const availableWidth = Math.max(baseFontSize * 2, width - leftPx - rightPx);
    const maxCaptionWidthPx = Math.min(
      availableWidth,
      parseDimensionToPx(
        style.maxCaptionWidth as string | number | undefined,
        width,
        availableWidth,
      ),
    );
    const align = resolveHorizontalAlign(containerPositionStyle, style.position);

    const tokenModels = visibleTokens.map((token, tokenIndex) => {
      const isActive = visibleStartIndex + tokenIndex === activeTokenIndex;
      const key = tokenKey(token.text);
      const isExplicitHighlight = highlightSet.has(key);
      const isAutomaticHighlight = key === automaticKeywordKey;
      const isHighlighted = isExplicitHighlight || isAutomaticHighlight;
      const tokenFrame = Math.max(
        0,
        frame - Math.round((token.fromMs / 1000) * fps),
      );
      const tokenPop = Math.min(tokenFrame / 5, 1);
      const highlightScale = isHighlighted ? style.highlightScale ?? 1.62 : 1;
      const scale =
        (isActive ? style.activeScale : style.inactiveScale) *
        highlightScale *
        interpolate(tokenPop, [0, 1], [style.activePopStartScale ?? 0.72, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }) *
        entrance;
      const strokeRatio = isHighlighted
        ? style.highlightStrokeRatio ?? 0.012
        : style.normalStrokeRatio ?? 0.045;
      const defaultTextShadow = isHighlighted
        ? `0 ${baseFontSize * 0.07}px ${baseFontSize * 0.08}px ${style.shadowColor}, 0 0 ${
            baseFontSize * 0.18
          }px rgba(255,255,255,0.3)`
        : `0 ${baseFontSize * 0.08}px ${baseFontSize * 0.09}px ${style.shadowColor}`;
      const configuredTextShadow = templateCss(
        isHighlighted ? style.highlightTextShadow : style.normalTextShadow,
        baseFontSize,
      );
      const dropShadow =
        templateCss(style.dropShadow, baseFontSize) ??
        `drop-shadow(0 ${baseFontSize * 0.04}px ${baseFontSize * 0.02}px rgba(0,0,0,0.35))`;
      const textColor = colorWithOpacity(
        isHighlighted
          ? style.highlightTextColor ?? style.textColor
          : style.normalTextColor ?? style.textColor,
        style.textOpacity *
          (isHighlighted
            ? style.highlightTextOpacityMultiplier ?? 1
            : style.normalTextOpacityMultiplier ?? 1),
      );
      const blendMode = mixBlendModeOrUndefined(
        isHighlighted
          ? style.highlightTextBlendMode ?? style.textBlendMode
          : style.normalTextBlendMode ?? style.textBlendMode,
      );
      const filterCss = stringOrUndefined(
        isHighlighted ? style.highlightTextFilterCss : style.normalTextFilterCss,
      );
      const label = normalizeToken(token.text, style.uppercase);
      const fontFamily = isHighlighted ? highlightFontFamily : normalFontFamily;
      const fontStyle = isHighlighted ? highlightFontStyle : normalFontStyle;
      const fontWeight = isHighlighted ? highlightFontWeight : normalFontWeight;
      const rawWidth = Math.max(
        baseFontSize * 0.45,
        measureTextWidth({
          text: label,
          fontFamily,
          fontStyle,
          fontWeight,
          fontSize: baseFontSize,
          letterSpacingPx,
        }),
      );
      const rawHeight = baseFontSize * Math.max(1.06, lineHeight + 0.24);

      return {
        key: `${token.text}-${token.fromMs}`,
        label,
        rawWidth,
        rawHeight,
        width: rawWidth * scale,
        height: rawHeight * scale,
        scale,
        isHighlighted,
        textColor,
        fontFamily,
        fontStyle,
        fontWeight,
        strokePx: Math.max(style.minStrokePx ?? 1, baseFontSize * strokeRatio),
        strokeColor: isHighlighted
          ? style.highlightStrokeColor ?? style.normalStrokeColor ?? style.shadowColor
          : style.normalStrokeColor ?? style.shadowColor,
        textShadow: configuredTextShadow ?? defaultTextShadow,
        dropShadow,
        blendMode,
        filterCss,
        letterSpacingPx,
      };
    });

    const rows: Array<{
      width: number;
      height: number;
      tokens: typeof tokenModels;
    }> = [];

    if (captionLayout === 'stacked') {
      for (const token of tokenModels) {
        rows.push({
          width: token.width,
          height: token.height,
          tokens: [token],
        });
      }
    } else {
      let currentRow: {
        width: number;
        height: number;
        tokens: typeof tokenModels;
      } = {
        width: 0,
        height: 0,
        tokens: [],
      };

      for (const token of tokenModels) {
        const nextWidth =
          currentRow.tokens.length === 0
            ? token.width
            : currentRow.width + gapPx + token.width;
        const shouldWrap =
          captionLayout === 'inline-wrap' &&
          currentRow.tokens.length > 0 &&
          nextWidth > maxCaptionWidthPx;

        if (shouldWrap) {
          rows.push(currentRow);
          currentRow = {
            width: token.width,
            height: token.height,
            tokens: [token],
          };
          continue;
        }

        currentRow = {
          width: nextWidth,
          height: Math.max(currentRow.height, token.height),
          tokens: [...currentRow.tokens, token],
        };
      }

      if (currentRow.tokens.length > 0) {
        rows.push(currentRow);
      }
    }

    const rowGap = captionLayout === 'stacked' ? gapPx : baseFontSize * 0.14;
    const totalHeight =
      rows.reduce((sum, row) => sum + row.height, 0) +
      Math.max(0, rows.length - 1) * rowGap;
    const topPxValue = containerPositionStyle.top as string | number | undefined;
    const bottomPxValue = containerPositionStyle.bottom as string | number | undefined;
    const topPx =
      topPxValue === undefined
        ? null
        : parseDimensionToPx(topPxValue, height, height * 0.5);
    const bottomPx =
      bottomPxValue === undefined
        ? null
        : parseDimensionToPx(bottomPxValue, height, height * 0.12);
    const hasCenterTranslateY =
      typeof containerPositionStyle.transform === 'string' &&
      containerPositionStyle.transform.includes('translateY(-50%)');

    const contentTop =
      bottomPx !== null
        ? height - bottomPx - totalHeight
        : topPx !== null
          ? hasCenterTranslateY
            ? topPx - totalHeight / 2
            : topPx
          : (height - totalHeight) / 2;

    const laidOutTokens: LayoutToken[] = [];
    let rowY = contentTop;

    for (const row of rows) {
      const rowLeft =
        align === 'center'
          ? leftPx + (availableWidth - row.width) / 2
          : align === 'right'
            ? width - rightPx - row.width
            : leftPx;
      let currentX = rowLeft;

      for (const token of row.tokens) {
        laidOutTokens.push({
          ...token,
          x: currentX,
          y: rowY + (row.height - token.height) / 2,
        });
        currentX += token.width + gapPx;
      }

      rowY += row.height + rowGap;
    }

    const minX = Math.min(...laidOutTokens.map((token) => token.x));
    const maxX = Math.max(...laidOutTokens.map((token) => token.x + token.width));
    const minY = Math.min(...laidOutTokens.map((token) => token.y));
    const maxY = Math.max(...laidOutTokens.map((token) => token.y + token.height));
    const originX =
      align === 'center' ? (minX + maxX) / 2 : align === 'right' ? maxX : minX;
    const originY = (minY + maxY) / 2;
    const motionMatrix = buildMotionMatrix({
      originX,
      originY,
      translateX: motionValues.xPx,
      translateY: motionValues.yPx,
      scale: motionValues.scale,
      rotateDeg: motionValues.rotateDeg,
    });
    const normalMaskUrl = buildMaskDataUrl({
      width,
      height,
      tokens: laidOutTokens.filter((token) => !token.isHighlighted),
      fontSize: baseFontSize,
      lineHeight,
      matrix: motionMatrix,
    });
    const highlightMaskUrl = buildMaskDataUrl({
      width,
      height,
      tokens: laidOutTokens.filter((token) => token.isHighlighted),
      fontSize: baseFontSize,
      lineHeight,
      matrix: motionMatrix,
    });

    return {
      tokens: laidOutTokens,
      normalMaskUrl,
      highlightMaskUrl,
      motionMatrix,
    };
  }, [
    activeTokenIndex,
    automaticKeywordKey,
    baseFontSize,
    captionLayout,
    containerPositionStyle,
    entrance,
    fps,
    frame,
    height,
    highlightFontFamily,
    highlightFontStyle,
    highlightFontWeight,
    highlightSet,
    motionValues,
    normalFontFamily,
    normalFontStyle,
    normalFontWeight,
    page,
    style,
    visibleStartIndex,
    visibleTokens,
    width,
  ]);

  const maskedVideoEnabled =
    Boolean(style.effectLayerEnabled) && Boolean(style.effectMaskedVideoEnabled ?? true);
  const effectNormalOpacity =
    style.textOpacity *
    (style.effectMaskedVideoOpacityMultiplier ??
      style.effectTextOpacityMultiplier ??
      0.72);
  const effectHighlightOpacity =
    style.textOpacity *
    (style.effectMaskedHighlightVideoOpacityMultiplier ??
      style.effectHighlightTextOpacityMultiplier ??
      style.effectTextOpacityMultiplier ??
      0.8);
  const effectNormalBlendMode = mixBlendModeOrUndefined(
    style.effectMaskedVideoBlendMode ??
      style.effectNormalTextBlendMode ??
      style.effectTextBlendMode,
  );
  const effectHighlightBlendMode = mixBlendModeOrUndefined(
    style.effectMaskedHighlightVideoBlendMode ??
      style.effectHighlightTextBlendMode ??
      style.effectTextBlendMode,
  );
  const effectNormalFilter = stringOrUndefined(
    style.effectMaskedVideoFilterCss ??
      style.effectTextFilterCss ??
      'invert(1) contrast(2.35) saturate(0.08) brightness(1.12)',
  );
  const effectHighlightFilter = stringOrUndefined(
    style.effectMaskedHighlightVideoFilterCss ??
      style.effectHighlightTextFilterCss ??
      style.effectMaskedVideoFilterCss ??
      style.effectTextFilterCss ??
      'invert(1) contrast(2.65) saturate(0.12) brightness(1.16)',
  );
  const maskedVideoBaseStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: style.fit,
    borderRadius: style.videoBorderRadius ?? 0,
  };
  const captionMotionLayerStyle: CSSProperties = layout.motionMatrix
    ? {
        position: 'absolute',
        inset: 0,
        transform: matrixToCss(layout.motionMatrix),
        transformOrigin: '0 0',
        opacity: motionValues.opacity,
        pointerEvents: 'none',
      }
    : {
        position: 'absolute',
        inset: 0,
        opacity: motionValues.opacity,
        pointerEvents: 'none',
      };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#050505',
        isolation: style.isolateBlendMode === false ? undefined : 'isolate',
      }}
    >
      {videoSrc ? (
        <OffthreadVideo
          src={videoSource}
          style={{
            width: '100%',
            height: '100%',
            objectFit: style.fit,
            borderRadius: style.videoBorderRadius ?? 0,
            filter: style.videoFilter ?? 'none',
          }}
        />
      ) : null}

      <AbsoluteFill
        style={{
          background: style.backgroundOverlay ?? 'none',
          pointerEvents: 'none',
        }}
      />

      {maskedVideoEnabled && layout.normalMaskUrl ? (
        <AbsoluteFill
          style={{
            opacity: effectNormalOpacity * motionValues.opacity,
            mixBlendMode: effectNormalBlendMode,
            pointerEvents: 'none',
            WebkitMaskImage: `url("${layout.normalMaskUrl}")`,
            maskImage: `url("${layout.normalMaskUrl}")`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
          }}
        >
          <OffthreadVideo
            src={videoSource}
            muted
            style={{
              ...maskedVideoBaseStyle,
              filter: [style.videoFilter ?? 'none', effectNormalFilter]
                .filter((value) => value && value !== 'none')
                .join(' '),
            }}
          />
        </AbsoluteFill>
      ) : null}

      {maskedVideoEnabled && layout.highlightMaskUrl ? (
        <AbsoluteFill
          style={{
            opacity: effectHighlightOpacity * motionValues.opacity,
            mixBlendMode: effectHighlightBlendMode,
            pointerEvents: 'none',
            WebkitMaskImage: `url("${layout.highlightMaskUrl}")`,
            maskImage: `url("${layout.highlightMaskUrl}")`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
          }}
        >
          <OffthreadVideo
            src={videoSource}
            muted
            style={{
              ...maskedVideoBaseStyle,
              filter: [style.videoFilter ?? 'none', effectHighlightFilter]
                .filter((value) => value && value !== 'none')
                .join(' '),
            }}
          />
        </AbsoluteFill>
      ) : null}

      {layout.tokens.length > 0 && style.visibleTextLayerEnabled !== false ? (
        <div style={captionMotionLayerStyle}>
          {layout.tokens.map((token) => {
            const baseTextStyle: CSSProperties = {
              display: 'inline-block',
              color: token.textColor,
              fontFamily: token.fontFamily,
              fontStyle: token.fontStyle,
              fontWeight: token.fontWeight,
              fontSize: baseFontSize,
              lineHeight: style.lineHeight ?? 0.82,
              letterSpacing: style.letterSpacing ?? 0,
              WebkitTextStroke: `${token.strokePx}px ${token.strokeColor}`,
              paintOrder: 'stroke fill',
              textShadow: token.textShadow,
              filter: [token.dropShadow, token.filterCss].filter(Boolean).join(' '),
              mixBlendMode: token.blendMode,
              whiteSpace: 'pre',
            };

            return (
              <span
                key={token.key}
                style={{
                  position: 'absolute',
                  left: token.x,
                  top: token.y,
                  width: token.rawWidth,
                  height: token.rawHeight,
                  transform: `scale(${token.scale})`,
                  transformOrigin: 'top left',
                }}
              >
                <span style={baseTextStyle}>{token.label}</span>
              </span>
            );
          })}
        </div>
      ) : null}

      {foregroundSource ? (
        <OffthreadVideo
          src={foregroundSource}
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: style.fit,
            borderRadius: style.videoBorderRadius ?? 0,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
