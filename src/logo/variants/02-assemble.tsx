import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {approxPathLength, originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'assemble',
  name: 'Assemble',
  durationInFrames: 120,
  description:
    'Layers sweep in from opposite sides and settle with springy motion into a composed logo.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const brackets = logo.layer('brackets');
  const mark = logo.layer('l-mark');
  const card = logo.layer('card');
  const wordmark = logo.layer('wordmark');

  const markOffX = -(mark?.box?.x ?? 220);
  const cardOffX = logo.width - (card?.box?.x ?? 0) + 260;
  const cardOffY = (card?.box?.y ?? 220) + 180;

  const markSpring = spring({frame: frame - 14, fps, config: {damping: 17, stiffness: 150}});
  const cardSpring = spring({frame: frame - 28, fps, config: {damping: 13, stiffness: 125}});
  const wordSpring = spring({frame: frame - 44, fps, config: {damping: 15}});

  const markX = interpolate(markSpring, [0, 1], [markOffX, 0]);
  const markR = interpolate(markSpring, [0, 1], [-8, 0]);
  const cardX = interpolate(cardSpring, [0, 1], [cardOffX, 0]);
  const cardY = interpolate(cardSpring, [0, 1], [cardOffY, 0]);
  const cardR = interpolate(cardSpring, [0, 1], [14, 0]);

  const wordY = interpolate(wordSpring, [0, 1], [32, 0]);
  const markOpacity = interpolate(frame, [10, 24], [0, 1]);
  const cardOpacity = interpolate(frame, [26, 42], [0, 1]);
  const wordOpacity = interpolate(frame, [40, 60], [0, 1]);

  const bracketPaths = [...(brackets?.markup.matchAll(/<path[^>]*\sd="([^"]+)"/g) ?? [])].map(
    (m) => m[1]
  );
  const dashLen = Math.max(...(bracketPaths.length ? bracketPaths.map(approxPathLength) : [120]));

  return (
    <LogoSvg logo={logo}>
      {brackets ? (
        <g
          fill="none"
          stroke={brackets.stroke ?? logo.brand.palette.accentLight}
          strokeWidth={brackets.strokeWidth ?? 14}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {bracketPaths.map((d, i) => {
            const draw = interpolate(frame, [i * 4, i * 4 + 26], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return <path key={d} d={d} strokeDasharray={dashLen} strokeDashoffset={dashLen * (1 - draw)} />;
          })}
        </g>
      ) : null}

      <g opacity={markOpacity} style={{transform: `translateX(${markX}px) rotate(${markR}deg)`}}>
        <RawLayer
          logo={logo}
          id="l-mark"
          style={{transformOrigin: originOf(logo, 'l-mark')}}
        />
      </g>

      <g opacity={cardOpacity} style={{transform: `translate(${cardX}px, ${cardY}px) rotate(${cardR}deg)`}}>
        <RawLayer
          logo={logo}
          id="card"
          style={{transformOrigin: originOf(logo, 'card')}}
        />
      </g>

      {wordmark ? (
        <g opacity={wordOpacity} style={{transform: `translateY(${wordY}px)`}}>
          <RawLayer
            logo={logo}
            id="wordmark"
            style={{transformOrigin: originOf(logo, 'wordmark')}}
          />
        </g>
      ) : null}
    </LogoSvg>
  );
};

export default Variant;
