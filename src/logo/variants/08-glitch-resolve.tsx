import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {approxPathLength} from '../load-logo';
import {originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'glitch-resolve',
  name: 'Glitch Resolve',
  durationInFrames: 120,
  description:
    'Offsets and jitter collapse into a stable logo as a clean pass lands.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame}) => {
  const brackets = logo.layer('brackets');
  const mark = logo.layer('l-mark');
  const card = logo.layer('card');
  const wordmark = logo.layer('wordmark');

  const settle = spring({frame: frame - 18, fps: 30, config: {damping: 16, stiffness: 150}});
  const lockOpacity = interpolate(settle, [0, 1], [0, 1]);
  const settleBeat = interpolate(frame, [18, 44], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const jitter = interpolate(frame, [0, 42], [16, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sign = (Math.round(frame / 3) % 2 === 0 ? 1 : -1);
  const marker = interpolate(frame, [0, 28], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const bracketPaths = [...(brackets?.markup.matchAll(/<path[^>]*\sd="([^"]+)"/g) ?? [])].map((m) => m[1]);
  const dashLen = Math.max(...(bracketPaths.length ? bracketPaths.map(approxPathLength) : [120]));

  return (
    <LogoSvg logo={logo}>
      {mark ? (
        <>
          <g
            opacity={marker}
            style={{
              transform: `translate(${jitter * 0.7 * sign}px, ${jitter * 0.4 * sign}px)`,
              transformOrigin: originOf(logo, 'l-mark'),
            }}
          >
            <RawLayer logo={logo} id="l-mark" />
          </g>
          <g
            opacity={settleBeat}
            style={{
              transform: `translate(${jitter * -0.5 * sign}px, ${jitter * -0.3 * sign}px)`,
              transformOrigin: originOf(logo, 'l-mark'),
            }}
          >
            <RawLayer logo={logo} id="l-mark" />
          </g>
        </>
      ) : null}

      {card ? (
        <>
          <g
            opacity={marker}
            style={{
              transform: `translate(${jitter * -0.6 * sign}px, ${jitter * 0.3 * sign}px)`,
              transformOrigin: originOf(logo, 'card'),
            }}
          >
            <RawLayer logo={logo} id="card" />
          </g>
          <g opacity={lockOpacity}>
            <RawLayer logo={logo} id="card" />
          </g>
        </>
      ) : null}

      {wordmark ? (
        <>
          <g
            opacity={marker}
            style={{
              transform: `translate(${jitter * 0.45 * sign}px, ${jitter * -0.45 * sign}px)`,
              transformOrigin: originOf(logo, 'wordmark'),
            }}
          >
            <RawLayer logo={logo} id="wordmark" />
          </g>
          <g opacity={lockOpacity} style={{transformOrigin: originOf(logo, 'wordmark')}}>
            <RawLayer logo={logo} id="wordmark" />
          </g>
        </>
      ) : null}

      {bracketPaths.length ? (
        <g
          fill="none"
          stroke={brackets?.stroke ?? logo.brand.palette.primary}
          strokeWidth={(brackets?.strokeWidth ?? 14) * (1 + (1 - lockOpacity) * 0.08)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={interpolate(frame, [0, 26], [0.2, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })}
        >
          {bracketPaths.map((d, i) => {
            const draw = interpolate(frame, [i * 4, i * 4 + 20], [0, 1], {
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
