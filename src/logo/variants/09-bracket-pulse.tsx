import React from 'react';
import {LogoSvg, RawLayer} from '../logo-stage';
import {approxPathLength} from '../load-logo';
import {interpolate, spring} from 'remotion';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'bracket-pulse',
  name: 'Bracket Pulse',
  durationInFrames: 120,
  description: 'Logo settles, then the scan brackets pulse like a shutter as a final capture beat.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const brackets = logo.layer('brackets');
  const mark = logo.layer('l-mark');
  const card = logo.layer('card');
  const wordmark = logo.layer('wordmark');

  const settle = spring({frame: frame - 16, fps, config: {damping: 17, stiffness: 150}});
  const settleX = interpolate(settle, [0, 1], [0.86, 1]);
  const settleY = interpolate(settle, [0, 1], [14, 0]);
  const settleOpacity = interpolate(frame, [10, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const beat = interpolate(frame, [58, 82], [0, 1]);
  const pulseScale = interpolate(beat, [0, 0.4, 1], [1, 1.08, 1]);
  const pulseOpacity = interpolate(beat, [0, 0.4, 1], [0.2, 1, 0.85]);

  const bracketPaths = [...(brackets?.markup.matchAll(/<path[^>]*\sd="([^"]+)"/g) ?? [])].map((m) => m[1]);
  const pathLen = Math.max(...(bracketPaths.length ? bracketPaths.map(approxPathLength) : [120]));

  return (
    <LogoSvg logo={logo}>
      {bracketPaths.length ? (
        <g
          fill="none"
          stroke={brackets?.stroke ?? logo.brand.palette.accent}
          strokeWidth={(brackets?.strokeWidth ?? 14) * pulseScale}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={interpolate(frame, [0, 20], [0.2, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })}
        >
          {bracketPaths.map((d, i) => {
            const draw = interpolate(frame, [i * 3, i * 3 + 20], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return <path key={d} d={d} strokeDasharray={pathLen} strokeDashoffset={pathLen * (1 - draw)} />;
          })}
        </g>
      ) : null}

      {mark ? (
        <g opacity={settleOpacity} style={{transform: `scale(${settleX}) translateY(${settleY}px)`, transformOrigin: `${logo.width / 2}px ${logo.height / 2}px`}}>
          <RawLayer logo={logo} id="l-mark" />
        </g>
      ) : null}

      {card ? (
        <g opacity={settleOpacity} style={{transform: `scale(${settleX})`, transformOrigin: `${logo.width / 2}px ${logo.height / 2}px`}}>
          <RawLayer logo={logo} id="card" />
        </g>
      ) : null}

      {wordmark ? (
        <g opacity={settleOpacity} style={{transform: `translateY(${settleY}px) scale(${settleX})`, transformOrigin: `${logo.width / 2}px ${logo.height / 2}px`}}>
          <RawLayer logo={logo} id="wordmark" />
        </g>
      ) : null}

      <g
        opacity={interpolate(frame, [56, 68], [0, pulseOpacity], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
        style={{transform: `scale(${pulseScale})`, transformOrigin: `${logo.width / 2}px ${logo.height / 2}px`}}
      >
        {mark ? <RawLayer logo={logo} id="l-mark" /> : null}
      </g>
    </LogoSvg>
  );
};

export default Variant;
