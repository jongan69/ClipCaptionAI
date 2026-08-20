import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

/**
 * Two circles orbit in from left and right, connector stem draws upward,
 * wordmark fades in last. Designed for brands with `mark-left`, `mark-right`,
 * `connector`, and `wordmark` layers.
 */
export const meta = {
  id: 'orbit-in',
  name: 'Orbit In',
  durationInFrames: 120,
  description:
    'Left and right circles orbit in from opposite sides with a spring settle, stem draws up, wordmark rises last.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const leftCircle = logo.layer('mark-left');
  const rightCircle = logo.layer('mark-right');
  const connector = logo.layer('connector');
  const wordmark = logo.layer('wordmark');

  // --- left circle sweeps in from the left -----------------------------------
  const leftSpring = spring({frame: frame - 8, fps, config: {damping: 16, stiffness: 140}});
  const leftX = interpolate(leftSpring, [0, 1], [-260, 0]);
  const leftRotate = interpolate(leftSpring, [0, 1], [-30, 0]);
  const leftOpacity = interpolate(frame, [8, 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // --- right circle sweeps in from the right ---------------------------------
  const rightSpring = spring({frame: frame - 18, fps, config: {damping: 16, stiffness: 140}});
  const rightX = interpolate(rightSpring, [0, 1], [280, 0]);
  const rightRotate = interpolate(rightSpring, [0, 1], [30, 0]);
  const rightOpacity = interpolate(frame, [18, 36], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // --- connector stem draws upward (stroke-dasharray animation) ---------------
  const stemPaths = [...(connector?.markup.matchAll(/<path[^>]*\sd="([^"]+)"/g) ?? [])].map(
    (m) => m[1]
  );
  const stemLen = 300; // approximate vertical path length
  const stemDraw = interpolate(frame, [28, 52], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // --- wordmark rises last ---------------------------------------------------
  const wordSpring = spring({frame: frame - 52, fps, config: {damping: 15}});
  const wordY = interpolate(wordSpring, [0, 1], [32, 0]);
  const wordOpacity = interpolate(frame, [52, 72], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <LogoSvg logo={logo}>
      {/* Left circle — orbits in from left */}
      {leftCircle ? (
        <g
          opacity={leftOpacity}
          style={{
            transform: `translateX(${leftX}px) rotate(${leftRotate}deg)`,
            transformOrigin: originOf(logo, 'mark-left'),
          }}
        >
          <RawLayer logo={logo} id="mark-left" />
        </g>
      ) : null}

      {/* Right circle — orbits in from right */}
      {rightCircle ? (
        <g
          opacity={rightOpacity}
          style={{
            transform: `translateX(${rightX}px) rotate(${rightRotate}deg)`,
            transformOrigin: originOf(logo, 'mark-right'),
          }}
        >
          <RawLayer logo={logo} id="mark-right" />
        </g>
      ) : null}

      {/* Connector stem — draws upward */}
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
