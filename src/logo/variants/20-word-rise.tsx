import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

/**
 * Minimal and elegant: the full mark fades in with a gentle scale-up while
 * the wordmark rises from below. Clean, professional, suitable as a brand
 * bumper or app loading screen.
 */
export const meta = {
  id: 'word-rise',
  name: 'Word Rise',
  durationInFrames: 90,
  description:
    'Mark fades and scales in gently, wordmark rises from below — clean and minimal brand reveal.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const leftCircle = logo.layer('mark-left');
  const rightCircle = logo.layer('mark-right');
  const connector = logo.layer('connector');
  const wordmark = logo.layer('wordmark');

  // --- mark rises and scales in -----------------------------------------------
  const markSpring = spring({frame: frame - 6, fps, config: {damping: 18, stiffness: 140}});
  const markScale = interpolate(markSpring, [0, 1], [0.92, 1]);
  const markY = interpolate(markSpring, [0, 1], [16, 0]);
  const markOpacity = interpolate(frame, [6, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // --- connector gets a slight delayed fade -----------------------------------
  const connOpacity = interpolate(frame, [18, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // --- wordmark rises from below with a floaty spring -------------------------
  const wordSpring = spring({frame: frame - 30, fps, config: {damping: 14, stiffness: 100}});
  const wordY = interpolate(wordSpring, [0, 1], [48, 0]);
  const wordOpacity = interpolate(frame, [30, 56], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <LogoSvg logo={logo}>
      {/* Left circle */}
      {leftCircle ? (
        <g
          opacity={markOpacity}
          style={{
            transform: `translateY(${markY}px) scale(${markScale})`,
            transformOrigin: originOf(logo, 'mark-left'),
          }}
        >
          <RawLayer logo={logo} id="mark-left" />
        </g>
      ) : null}

      {/* Right circle */}
      {rightCircle ? (
        <g
          opacity={markOpacity}
          style={{
            transform: `translateY(${markY}px) scale(${markScale})`,
            transformOrigin: originOf(logo, 'mark-right'),
          }}
        >
          <RawLayer logo={logo} id="mark-right" />
        </g>
      ) : null}

      {/* Connector — slightly delayed */}
      {connector ? (
        <g
          opacity={connOpacity}
          style={{
            transform: `translateY(${markY}px) scale(${markScale})`,
            transformOrigin: originOf(logo, 'connector'),
          }}
        >
          <RawLayer logo={logo} id="connector" />
        </g>
      ) : null}

      {/* Wordmark — rises from below */}
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
