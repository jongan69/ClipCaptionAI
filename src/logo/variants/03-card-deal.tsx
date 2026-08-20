import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {approxPathLength, originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'card-deal',
  name: 'Card Deal',
  durationInFrames: 120,
  description:
    'The listing card flips and lands with card-snap energy, then mark and wordmark follow.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const frameLayer = logo.layer('frame');
  const card = logo.layer('card');
  const mark = logo.layer('mark');
  const wordmark = logo.layer('wordmark');

  const deal = spring({frame: frame - 10, fps, config: {damping: 14, stiffness: 180}});
  const cardY = interpolate(deal, [0, 1], [-(card?.box?.y ?? 260), 0]);
  const cardX = interpolate(deal, [0, 1], [80, 0]);
  const cardR = interpolate(deal, [0, 1], [-12, 0]);
  const cardScale = interpolate(deal, [0, 1], [1.08, 1]);
  const cardFlip = interpolate(frame, [0, 28], [26, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const markDrop = spring({frame: frame - 34, fps, config: {damping: 15, stiffness: 120}});
  const markY = interpolate(markDrop, [0, 1], [26, 0]);
  const markScale = interpolate(markDrop, [0, 1], [0.9, 1]);
  const markOpacity = interpolate(frame, [28, 46], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const word = spring({frame: frame - 54, fps, config: {damping: 18, stiffness: 110}});
  const wordY = interpolate(word, [0, 1], [24, 0]);
  const wordOpacity = interpolate(word, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const framePaths = [...(frameLayer?.markup.matchAll(/<path[^>]*\sd="([^"]+)"/g) ?? [])].map(
    (m) => m[1]
  );
  const dashLen = Math.max(...(framePaths.length ? framePaths.map(approxPathLength) : [120]));

  return (
    <LogoSvg logo={logo}>
      <g
        opacity={cardOpacity}
        style={{
          transform: `translate(${cardX}px, ${cardY}px) rotate(${cardR}deg) scale(${cardScale}) translateY(${cardFlip}px)`,
          transformOrigin: originOf(logo, 'card'),
        }}
      >
        <RawLayer logo={logo} id="card" />
      </g>

      <g opacity={markOpacity} style={{transform: `translateY(${markY}px) scale(${markScale})`}}>
        <RawLayer
          logo={logo}
          id="mark"
          style={{transformOrigin: originOf(logo, 'mark')}}
        />
      </g>

      {wordmark ? (
        <g
          opacity={wordOpacity}
          style={{transform: `translateY(${wordY}px)`, transformOrigin: originOf(logo, 'wordmark')}}
        >
          <RawLayer logo={logo} id="wordmark" />
        </g>
      ) : null}

      {frameLayer ? (
        <g
          fill="none"
          stroke={frameLayer.stroke ?? logo.brand.palette.primary}
          strokeWidth={frameLayer.strokeWidth ?? 14}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {framePaths.map((d, i) => {
            const draw = interpolate(frame, [58 + i * 3, 58 + i * 3 + 12], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return <path key={d} d={d} strokeDasharray={dashLen} strokeDashoffset={dashLen * (1 - draw)} />;
          })}
        </g>
      ) : null}
    </LogoSvg>
  );
};

export default Variant;
