import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {approxPathLength} from '../load-logo';
import {originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'wave-ripple',
  name: 'Wave Ripple',
  durationInFrames: 120,
  description: 'A small camera-wave settles through each element before the brand locks into stillness.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const brackets = logo.layer('brackets');
  const mark = logo.layer('l-mark');
  const card = logo.layer('card');
  const wordmark = logo.layer('wordmark');

  const markIn = spring({frame: frame - 10, fps, config: {damping: 16, stiffness: 130}});
  const cardIn = spring({frame: frame - 24, fps, config: {damping: 14, stiffness: 140}});
  const wordIn = spring({frame: frame - 44, fps, config: {damping: 12, stiffness: 160}});

  const settle = spring({frame: frame - 78, fps, config: {damping: 11, stiffness: 120}});
  const settleT = interpolate(settle, [0, 1], [0, 1]);
  const settleScale = interpolate(settleT, [0, 0.45, 1], [1.03, 1.055, 1]);

  const markX = interpolate(markIn, [0, 1], [-24, 0]);
  const markY = interpolate(markIn, [0, 1], [14, 0]) + Math.sin(frame * 0.11) * (1 - settleT) * 6;
  const markR = interpolate(markIn, [0, 1], [7, 0]);
  const markScale = interpolate(markIn, [0, 1], [0.91, 1]);
  const markOpacity = interpolate(markIn, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cardX = interpolate(cardIn, [0, 1], [36, 0]);
  const cardY = interpolate(cardIn, [0, 1], [-14, 0]);
  const cardR = interpolate(cardIn, [0, 1], [-9, 0]);
  const cardScale = interpolate(cardIn, [0, 1], [1.08, 1]);
  const cardOpacity = interpolate(cardIn, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const waveOffset = Math.sin((frame - 24) * 0.14) * (1 - settleT) * 8;
  const wordY = interpolate(wordIn, [0, 1], [20, 0]) + waveOffset;
  const wordX = interpolate(settleT, [0, 1], [12, 0]);
  const wordScale = interpolate(wordIn, [0, 1], [0.94, 1]);
  const wordOpacity = interpolate(wordIn, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const bracketPaths = [...(brackets?.markup.matchAll(/<path[^>]*\\sd="([^"]+)"/g) ?? [])].map(
    (m) => m[1]
  );
  const dashLen = Math.max(...(bracketPaths.length ? bracketPaths.map(approxPathLength) : [120]));

  return (
    <LogoSvg logo={logo}>
      {mark ? (
        <g
          opacity={markOpacity}
          style={{
            transform: `translate(${markX}px, ${markY}px) scale(${markScale}) rotate(${markR}deg)`,
            transformOrigin: originOf(logo, 'l-mark'),
          }}
        >
          <RawLayer logo={logo} id="l-mark" />
        </g>
      ) : null}

      {card ? (
        <g
          opacity={cardOpacity}
          style={{
            transform: `translate(${cardX}px, ${cardY}px) scale(${cardScale}) rotate(${cardR}deg)`,
            transformOrigin: originOf(logo, 'card'),
          }}
        >
          <RawLayer logo={logo} id="card" />
        </g>
      ) : null}

      {wordmark ? (
        <g
          opacity={wordOpacity}
          style={{
            transform: `translate(${wordX}px, ${wordY}px) scale(${wordScale})`,
            transformOrigin: originOf(logo, 'wordmark'),
          }}
        >
          <RawLayer logo={logo} id="wordmark" />
        </g>
      ) : null}

      {brackets ? (
        <g
          fill="none"
          stroke={brackets.stroke ?? logo.brand.palette.primary}
          strokeWidth={brackets.strokeWidth ?? 14}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={settleScale}
        >
          {bracketPaths.map((d, i) => {
            const draw = interpolate(frame, [52 + i * 3, 74 + i * 3], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return <path key={d} d={d} strokeDasharray={dashLen} strokeDashoffset={dashLen * (1 - draw)} />;
          })}
        </g>
      ) : null}

      <g
        opacity={settle}
        style={{
          transform: `scale(${settleScale})`,
          transformOrigin: `${logo.width / 2}px ${logo.height / 2}px`,
        }}
      >
        <RawLayer logo={logo} id="l-mark" />
        <RawLayer logo={logo} id="card" />
        <RawLayer logo={logo} id="wordmark" />
      </g>
    </LogoSvg>
  );
};

export default Variant;
