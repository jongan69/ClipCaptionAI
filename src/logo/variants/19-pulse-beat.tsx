import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

/**
 * A warm heartbeat pulse ripples through the mark. Circles overlap, pulse,
 * settle. The connector fades in as the connection solidifies. Wordmark rises.
 * Warm and human — fitting for a dating/connection brand.
 */
export const meta = {
  id: 'pulse-beat',
  name: 'Pulse Beat',
  durationInFrames: 120,
  description:
    'Heartbeat pulse ripples through overlapping circles, connector fades in, wordmark rises — warm organic feel.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const leftCircle = logo.layer('mark-left');
  const rightCircle = logo.layer('mark-right');
  const connector = logo.layer('connector');
  const wordmark = logo.layer('wordmark');

  // --- initial fade in -------------------------------------------------------
  const markOpacity = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // --- three heartbeat pulses -------------------------------------------------
  const beat1 = spring({frame: frame - 14, fps, config: {damping: 8, stiffness: 200}});
  const beat2 = spring({frame: frame - 28, fps, config: {damping: 8, stiffness: 200}});
  const beat3 = spring({frame: frame - 44, fps, config: {damping: 12, stiffness: 180}});

  const beatScale =
    1 +
    interpolate(beat1, [0, 1], [0.12, 0]) * 0.7 +
    interpolate(beat2, [0, 1], [0.08, 0]) * 0.5 +
    interpolate(beat3, [0, 1], [0.04, 0]) * 0.3;

  // --- left and right circles get slightly offset beats for organic feel -----
  const leftBeatOffset = interpolate(
    spring({frame: frame - 16, fps, config: {damping: 8, stiffness: 200}}),
    [0, 1],
    [4, 0]
  );

  // --- connector fades in as connection solidifies ---------------------------
  const connOpacity = interpolate(frame, [48, 68], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // --- wordmark --------------------------------------------------------------
  const wordSpring = spring({frame: frame - 60, fps, config: {damping: 16}});
  const wordY = interpolate(wordSpring, [0, 1], [20, 0]);
  const wordOpacity = interpolate(frame, [60, 80], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <LogoSvg logo={logo}>
      {/* Left circle with subtle offset beat */}
      {leftCircle ? (
        <g
          opacity={markOpacity}
          style={{
            transform: `scale(${beatScale}) translateY(${leftBeatOffset}px)`,
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
            transform: `scale(${beatScale})`,
            transformOrigin: originOf(logo, 'mark-right'),
          }}
        >
          <RawLayer logo={logo} id="mark-right" />
        </g>
      ) : null}

      {/* Connector */}
      {connector ? (
        <g opacity={connOpacity}>
          <RawLayer logo={logo} id="connector" />
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
