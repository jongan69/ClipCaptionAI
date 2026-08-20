import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

/**
 * The connector stem draws upward like a growing plant. As it reaches full
 * height, the circles bloom outward from the overlap center, then the wordmark
 * fades in below.
 */
export const meta = {
  id: 'stem-grow',
  name: 'Stem Grow',
  durationInFrames: 120,
  description:
    'Connector stem draws upward like a growing plant, circles bloom outward, wordmark rises.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const leftCircle = logo.layer('mark-left');
  const rightCircle = logo.layer('mark-right');
  const connector = logo.layer('connector');
  const wordmark = logo.layer('wordmark');

  // --- stem draws upward (stroke-dasharray from bottom) -----------------------
  const stemPaths = [...(connector?.markup.matchAll(/<path[^>]*\sd="([^"]+)"/g) ?? [])].map(
    (m) => m[1]
  );
  const stemLen = 300;
  const stemDraw = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // --- circles bloom from center as stem finishes ----------------------------
  const bloomSpring = spring({frame: frame - 24, fps, config: {damping: 14, stiffness: 130}});
  const leftBloomX = interpolate(bloomSpring, [0, 1], [-120, 0]);
  const rightBloomX = interpolate(bloomSpring, [0, 1], [120, 0]);
  const bloomScale = interpolate(bloomSpring, [0, 1], [0.3, 1]);
  const bloomOpacity = interpolate(frame, [24, 44], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // --- settle pulse after bloom ----------------------------------------------
  const settle = spring({frame: frame - 48, fps, config: {damping: 12, stiffness: 160}});
  const settleScale = interpolate(settle, [0, 1], [1.08, 1]);

  // --- wordmark --------------------------------------------------------------
  const wordSpring = spring({frame: frame - 62, fps, config: {damping: 15}});
  const wordY = interpolate(wordSpring, [0, 1], [24, 0]);
  const wordOpacity = interpolate(frame, [62, 82], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <LogoSvg logo={logo}>
      {/* Connector stem draws upward */}
      {connector ? (
        <g
          fill="none"
          stroke={connector.stroke ?? logo.brand.palette.primary}
          strokeWidth={connector.strokeWidth ?? 112}
          strokeLinecap="round"
        >
          {stemPaths.map((d) => (
            <path
              key={d}
              d={d}
              strokeDasharray={stemLen}
              strokeDashoffset={stemLen * (1 - stemDraw)}
            />
          ))}
        </g>
      ) : null}

      {/* Left circle blooms from center */}
      {leftCircle ? (
        <g
          opacity={bloomOpacity}
          style={{
            transform: `translateX(${leftBloomX}px) scale(${bloomScale * settleScale})`,
            transformOrigin: originOf(logo, 'mark-left'),
          }}
        >
          <RawLayer logo={logo} id="mark-left" />
        </g>
      ) : null}

      {/* Right circle blooms from center */}
      {rightCircle ? (
        <g
          opacity={bloomOpacity}
          style={{
            transform: `translateX(${rightBloomX}px) scale(${bloomScale * settleScale})`,
            transformOrigin: originOf(logo, 'mark-right'),
          }}
        >
          <RawLayer logo={logo} id="mark-right" />
        </g>
      ) : null}

      {/* Wordmark */}
      {wordmark ? (
        <g
          opacity={wordOpacity}
          style={{transform: `translateY(${wordY}px)`}}
        >
          <RawLayer logo={logo} id="wordmark" />
        </g>
      ) : null}
    </LogoSvg>
  );
};

export default Variant;
