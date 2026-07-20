import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'gradient-sweep',
  name: 'Gradient Sweep',
  durationInFrames: 120,
  description: 'A soft highlight ribbon passes across the completed logo like a polished reveal.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame}) => {
  const mark = logo.layer('l-mark');
  const card = logo.layer('card');
  const wordmark = logo.layer('wordmark');
  const brackets = logo.layer('brackets');

  const settle = spring({frame: frame - 14, fps: 30, config: {damping: 18, stiffness: 130}});
  const land = interpolate(settle, [0, 1], [0, 1]);

  const sweep = interpolate(frame, [52, 102], [-600, 1780], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sweepOpacity = interpolate(frame, [45, 58, 78, 92], [0, 0.55, 0.55, 0]);

  return (
    <LogoSvg logo={logo}>
      <defs>
        <linearGradient id={`logoSweep-${logo.slug}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="transparent" stopOpacity="0" />
          <stop offset="45%" stopColor={logo.brand.palette.surface ?? '#ffffff'} stopOpacity="0.65" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </linearGradient>
      </defs>

      {brackets ? (
        <g
          opacity={land}
          style={{transform: `scale(${interpolate(land, [0, 1], [0.98, 1])})`, transformOrigin: originOf(logo, 'brackets')}}
        >
          <RawLayer logo={logo} id="brackets" />
        </g>
      ) : null}

      {mark ? (
        <g opacity={land}>
          <RawLayer logo={logo} id="l-mark" />
        </g>
      ) : null}

      {card ? (
        <g opacity={land}>
          <RawLayer logo={logo} id="card" />
        </g>
      ) : null}

      {wordmark ? (
        <g opacity={land}>
          <RawLayer logo={logo} id="wordmark" />
        </g>
      ) : null}

      <g opacity={sweepOpacity}>
        <rect
          x={sweep}
          y="0"
          width="420"
          height={logo.height}
          fill={`url(#logoSweep-${logo.slug})`}
        />
      </g>
    </LogoSvg>
  );
};

export default Variant;
