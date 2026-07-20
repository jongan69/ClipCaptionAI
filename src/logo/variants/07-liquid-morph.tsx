import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'liquid-morph',
  name: 'Liquid Morph',
  durationInFrames: 120,
  description: 'The mark blooms from a pulsing cell into the full symbol before card and text lock in.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const mark = logo.layer('l-mark');
  const card = logo.layer('card');
  const wordmark = logo.layer('wordmark');

  const swell = spring({frame: frame - 8, fps, config: {damping: 12, stiffness: 180}});
  const markScale = interpolate(swell, [0, 1], [0.1, 1]);
  const markY = interpolate(swell, [0, 1], [12, 0]);
  const markR = interpolate(swell, [0, 1], [-6, 0]);

  const drop = spring({frame: frame - 28, fps, config: {damping: 15, stiffness: 130}});
  const cardY = interpolate(drop, [0, 1], [30, 0]);
  const cardScale = interpolate(drop, [0, 1], [1.08, 1]);
  const cardOpacity = interpolate(frame, [28, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const wordSettle = spring({frame: frame - 60, fps, config: {damping: 16, stiffness: 160}});
  const wordY = interpolate(wordSettle, [0, 1], [22, 0]);
  const wordOpacity = interpolate(wordSettle, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const wordScale = interpolate(wordSettle, [0, 1], [0.95, 1]);
  const markOpacity = interpolate(frame, [8, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <LogoSvg logo={logo}>
      {mark ? (
        <g
          opacity={markOpacity}
          style={{
            transform: `translateY(${markY}px) scale(${markScale}) rotate(${markR}deg)`,
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
            transform: `translateY(${cardY}px) scale(${cardScale})`,
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
            transform: `translateY(${wordY}px) scale(${wordScale})`,
            transformOrigin: originOf(logo, 'wordmark'),
          }}
        >
          <RawLayer logo={logo} id="wordmark" />
        </g>
      ) : null}
    </LogoSvg>
  );
};

export default Variant;
