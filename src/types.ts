import type {Caption} from '@remotion/captions';

export type CaptionPosition =
  | 'left-hook'
  | 'right-hook'
  | 'lower-left'
  | 'center-bottom'
  | 'center-impact';
export type CaptionFit = 'cover' | 'contain';
export type CaptionLayout = 'stacked' | 'inline' | 'inline-wrap';
export type CaptionMotionPreset =
  | 'static'
  | 'center-pop'
  | 'center-to-left'
  | 'center-to-right'
  | 'float';

export type CaptionMotionKeyframe = {
  at: number;
  xPercent?: number;
  yPercent?: number;
  scale?: number;
  opacity?: number;
  rotateDeg?: number;
};

export type CaptionStyle = {
  position: CaptionPosition;
  customPosition?: Record<string, string | number>;
  vertical?: boolean;
  verticalContain?: boolean;
  outputAspect?: string;
  fit: CaptionFit;
  videoFilter?: string | null;
  videoBorderRadius?: string | number;
  combineTokensWithinMilliseconds: number;
  captionLayout?: CaptionLayout;
  motionPreset?: CaptionMotionPreset;
  motionKeyframes?: CaptionMotionKeyframe[];
  visibleTokensBefore?: number;
  visibleTokensAfter?: number;
  textColor: string;
  textOpacity: number;
  normalTextColor?: string;
  highlightTextColor?: string;
  visibleTextLayerEnabled?: boolean;
  normalTextOpacityMultiplier?: number;
  highlightTextOpacityMultiplier?: number;
  textBlendMode?: string;
  normalTextBlendMode?: string;
  highlightTextBlendMode?: string;
  normalTextFilterCss?: string;
  highlightTextFilterCss?: string;
  effectLayerEnabled?: boolean;
  effectTextColor?: string;
  effectHighlightTextColor?: string;
  effectTextOpacityMultiplier?: number;
  effectHighlightTextOpacityMultiplier?: number;
  effectTextBlendMode?: string;
  effectNormalTextBlendMode?: string;
  effectHighlightTextBlendMode?: string;
  effectTextFilterCss?: string;
  effectHighlightTextFilterCss?: string;
  effectMaskedVideoEnabled?: boolean;
  effectMaskedVideoFilterCss?: string;
  effectMaskedHighlightVideoFilterCss?: string;
  effectMaskedVideoBlendMode?: string;
  effectMaskedHighlightVideoBlendMode?: string;
  effectMaskedVideoOpacityMultiplier?: number;
  effectMaskedHighlightVideoOpacityMultiplier?: number;
  shadowColor: string;
  normalFontFamily?: string;
  highlightFontFamily?: string;
  normalFontWeight?: number;
  highlightFontWeight?: number;
  normalFontStyle?: string;
  highlightFontStyle?: string;
  baseFontSizeRatio?: number;
  minFontSize?: number;
  lineHeight?: number;
  gapRatio?: number;
  letterSpacing?: string | number;
  maxCaptionWidth?: string | number;
  highlightScale?: number;
  activePopStartScale?: number;
  normalStrokeRatio?: number;
  highlightStrokeRatio?: number;
  minStrokePx?: number;
  normalStrokeColor?: string;
  highlightStrokeColor?: string;
  normalTextShadow?: string;
  highlightTextShadow?: string;
  dropShadow?: string;
  backgroundOverlay?: string | null;
  isolateBlendMode?: boolean;
  activeScale: number;
  inactiveScale: number;
  uppercase: boolean;
  highlightedWords?: string[];
};

export type CaptionedClipProps = {
  videoSrc: string;
  foregroundSrc?: string | null;
  captions: Caption[];
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  style: CaptionStyle;
};
