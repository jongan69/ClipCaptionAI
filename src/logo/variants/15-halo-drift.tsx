import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'halo-drift',
  name: 'Halo Drift',
  durationInFrames: 120,
  description:
    'A soft halo drifts across the logo while layers lock in with controlled spring motion.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const mark = logo.layer('l-mark');
  const card = logo.layer('card');
  const wordmark = logo.layer('wordmark');
  const brackets = logo.layer('brackets');

  const markIn = spring({frame: frame - 10, fps, config: {damping: 16, stiffness: 170}});
  const cardIn = spring({frame: frame - 24, fps, config: {damping: 14, stiffness: 150}});
  const wordIn = spring({frame: frame - 44, fps, config: {damping: 15, stiffness: 130}});
  const settle = spring({frame: frame - 66, fps, config: {damping: 15, stiffness: 150}});

  const markY = interpolate(markIn, [0, 1], [16, 0]);
  const cardY = interpolate(cardIn, [0, 1], [22, 0]);
  const wordY = interpolate(wordIn, [0, 1], [26, 0]);
  const markScale = interpolate(markIn, [0, 1], [0.9, 1]);
  const cardScale = interpolate(cardIn, [0, 1], [1.1, 1]);
  const wordScale = interpolate(wordIn, [0, 1], [0.95, 1]);
  const markOpacity = interpolate(markIn, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardOpacity = interpolate(cardIn, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const wordOpacity = interpolate(wordIn, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const settlePulse = interpolate(settle, [0, 1], [1, 0.98], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const haloX = interpolate(frame, [42, 112], [-520, logo.width + 520], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ringRadius = interpolate(frame, [46, 96], [Math.max(logo.width, logo.height) * 0.35, logo.width * 0.95], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const haloOpacity = interpolate(frame, [36, 52, 100, 114], [0, 0.5, 0.5, 0]);

  return (
    <LogoSvg logo={logo}>
      <defs>
        <linearGradient id={`haloDrift-${logo.slug}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={logo.brand.palette.surface ?? '#ffffff'} stopOpacity="0" />
          <stop offset="50%" stopColor={logo.brand.palette.accent ?? logo.brand.palette.primary} stopOpacity="0.35" />
          <stop offset="100%" stopColor={logo.brand.palette.surface ?? '#ffffff'} stopOpacity="0" />
        </linearGradient>
      </defs>

      <g
        opacity={interpolate(settle, [0, 1], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
        style={{transform: `scale(${settlePulse})`, transformOrigin: originOf(logo, 'l-mark')}}
      >
        {mark ? (
          <g
            opacity={markOpacity}
            style={{
              transform: `translateY(${markY}px) scale(${markScale})`,
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

        {brackets ? <RawLayer logo={logo} id="brackets" /> : null}
      </g>

      <g opacity={haloOpacity}>
        <circle
          cx={haloX}
          cy={logo.height / 2}
          r={ringRadius}
          fill={`url(#haloDrift-${logo.slug})`}
          transform={`rotate(28 ${logo.width / 2} ${logo.height / 2})`}
        />
      </g>
    </LogoSvg>
  );
};

export default Variant;
