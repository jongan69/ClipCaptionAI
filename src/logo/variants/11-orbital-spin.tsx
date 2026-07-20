import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {approxPathLength, originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'orbital-spin',
  name: 'Orbital Spin',
  durationInFrames: 120,
  description: 'Mark and card orbit into place from opposite arcs, then lock into a crisp logo.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const brackets = logo.layer('brackets');
  const mark = logo.layer('l-mark');
  const card = logo.layer('card');
  const wordmark = logo.layer('wordmark');

  const orbit = spring({frame: frame - 10, fps, config: {damping: 16, stiffness: 150}});
  const settle = spring({frame: frame - 56, fps, config: {damping: 14, stiffness: 170}});
  const lock = interpolate(settle, [0, 1], [0, 1]);

  const orbitRadius = interpolate(orbit, [0, 1], [160, 0]);
  const markAngle = interpolate(frame, [10, 76], [-2.6, 0]);
  const cardAngle = interpolate(frame, [10, 80], [1.88, 0]);

  const markX = Math.cos(markAngle) * orbitRadius;
  const markY = Math.sin(markAngle) * orbitRadius * 0.58;
  const cardX = Math.cos(cardAngle) * orbitRadius * 0.95;
  const cardY = Math.sin(cardAngle) * orbitRadius * 0.58;

  const markScale = interpolate(orbit, [0, 1], [0.82, 1]);
  const cardScale = interpolate(orbit, [0, 1], [1.12, 1]);
  const markOpacity = interpolate(frame, [10, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardOpacity = interpolate(frame, [16, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pulse = interpolate(lock, [0, 0.42, 1], [1, 1.04, 1]);
  const wordOpacity = interpolate(frame, [52, 72], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const wordY = interpolate(frame, [56, 78], [22, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const bracketPaths = [...(brackets?.markup.matchAll(/<path[^>]*\\sd="([^"]+)"/g) ?? [])].map(
    (m) => m[1]
  );
  const dashLen = Math.max(...(bracketPaths.length ? bracketPaths.map(approxPathLength) : [120]));

  return (
    <LogoSvg logo={logo}>
      {brackets ? (
        <g
          fill="none"
          stroke={brackets.stroke ?? logo.brand.palette.primary}
          strokeWidth={brackets.strokeWidth ?? 14}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {bracketPaths.map((d, i) => {
            const draw = interpolate(frame, [28 + i * 4, 28 + i * 4 + 18], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return <path key={d} d={d} strokeDasharray={dashLen} strokeDashoffset={dashLen * (1 - draw)} />;
          })}
        </g>
      ) : null}

      {mark ? (
        <g
          opacity={markOpacity}
          style={{
            transform: `translate(${markX}px, ${markY}px) scale(${markScale}) rotate(${interpolate(
              orbit,
              [0, 1],
              [-8, 0]
            )}deg)`,
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
            transform: `translate(${cardX}px, ${cardY}px) scale(${cardScale}) rotate(${interpolate(
              orbit,
              [0, 1],
              [12, 0]
            )}deg)`,
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
            transform: `translateY(${wordY}px) scale(${interpolate(lock, [0, 1], [0.96, 1])})`,
            transformOrigin: originOf(logo, 'wordmark'),
          }}
        >
          <g
            opacity={lock}
            style={{transform: `scale(${pulse})`, transformOrigin: originOf(logo, 'l-mark')}}
          >
            <RawLayer logo={logo} id="wordmark" />
          </g>
        </g>
      ) : null}
    </LogoSvg>
  );
};

export default Variant;
