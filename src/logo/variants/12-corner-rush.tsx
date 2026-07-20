import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {approxPathLength, originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'corner-rush',
  name: 'Corner Rush',
  durationInFrames: 120,
  description:
    'Each core layer bursts in from a different corner, then lands into a tight, aligned stack.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const brackets = logo.layer('brackets');
  const mark = logo.layer('l-mark');
  const card = logo.layer('card');
  const wordmark = logo.layer('wordmark');

  const markIn = spring({frame: frame - 10, fps, config: {damping: 14, stiffness: 130}});
  const cardIn = spring({frame: frame - 22, fps, config: {damping: 13, stiffness: 150}});
  const wordIn = spring({frame: frame - 40, fps, config: {damping: 16, stiffness: 160}});

  const settle = spring({frame: frame - 72, fps, config: {damping: 15, stiffness: 130}});
  const settleAmp = interpolate(settle, [0, 1], [0.2, 1]);
  const settlePulse = interpolate(settleAmp, [0, 1], [1, 1.06]);
  const settleGlow = interpolate(frame, [72, 86], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const markFromX = -(mark?.box?.x ?? 0) - (mark?.box?.w ?? 210) - 40;
  const markFromY = -(mark?.box?.y ?? 0) - 90;
  const cardFromX = logo.width - (card?.box?.x ?? 0) + (card?.box?.w ?? 190) + 40;
  const cardFromY = logo.height - (card?.box?.y ?? 0) + (card?.box?.h ?? 190) + 80;

  const markX = interpolate(markIn, [0, 1], [markFromX, 0]);
  const markY = interpolate(markIn, [0, 1], [markFromY, 0]);
  const markR = interpolate(markIn, [0, 1], [-14, 0]);
  const markScale = interpolate(markIn, [0, 1], [0.88, 1]);
  const cardX = interpolate(cardIn, [0, 1], [cardFromX, 0]);
  const cardY = interpolate(cardIn, [0, 1], [cardFromY, 0]);
  const cardR = interpolate(cardIn, [0, 1], [18, 0]);
  const cardScale = interpolate(cardIn, [0, 1], [1.14, 1]);
  const wordY = interpolate(wordIn, [0, 1], [30, 0]);
  const wordScale = interpolate(wordIn, [0, 1], [0.96, 1]);
  const markOpacity = interpolate(markIn, [0, 0.45, 1], [0, 0.9, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardOpacity = interpolate(cardIn, [0, 0.5, 1], [0, 0.85, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
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
      <g
        opacity={cardOpacity}
        style={{
          transform: `translate(${cardX}px, ${cardY}px) rotate(${cardR}deg) scale(${cardScale})`,
          transformOrigin: originOf(logo, 'card'),
        }}
      >
        <RawLayer logo={logo} id="card" />
      </g>

      <g
        opacity={markOpacity}
        style={{
          transform: `translate(${markX}px, ${markY}px) rotate(${markR}deg) scale(${markScale})`,
          transformOrigin: originOf(logo, 'l-mark'),
        }}
      >
        <RawLayer logo={logo} id="l-mark" />
      </g>

      {wordmark ? (
        <g
          opacity={wordOpacity}
          style={{
            transform: `translateY(${wordY}px) scale(${wordScale})`,
            transformOrigin: originOf(logo, 'wordmark'),
          }}
        >
          <RawLayer logo={logo} id="wordmark" />
        </g>
      ) : null}

      {brackets ? (
        <g
          fill="none"
          stroke={brackets.stroke ?? logo.brand.palette.accent}
          strokeWidth={brackets.strokeWidth ?? 14}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={settleGlow}
          style={{transform: `scale(${settlePulse})`, transformOrigin: originOf(logo, 'brackets')}}
        >
          {bracketPaths.map((d, i) => {
            const draw = interpolate(frame, [48 + i * 3, 48 + i * 3 + 18], [0, 1], {
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
          transform: `scale(${settlePulse - settleAmp * 0.001})`,
          transformOrigin: `${logo.width / 2}px ${logo.height / 2}px`,
        }}
      >
        {brackets ? <RawLayer logo={logo} id="brackets" /> : null}
      </g>
    </LogoSvg>
  );
};

export default Variant;
