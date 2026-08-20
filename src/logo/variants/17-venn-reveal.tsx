import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

/**
 * Circles slide together from opposite sides creating a Venn-diagram overlap reveal,
 * connector draws downward, wordmark fades in. The overlap area is the focus.
 */
export const meta = {
  id: 'venn-reveal',
  name: 'Venn Reveal',
  durationInFrames: 120,
  description:
    'Two circles slide together from opposite sides, overlapping to form a shared connection space, wordmark rises.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const leftCircle = logo.layer('mark-left');
  const rightCircle = logo.layer('mark-right');
  const connector = logo.layer('connector');
  const wordmark = logo.layer('wordmark');

  // --- circles slide toward each other ---------------------------------------
  const slideSpring = spring({frame: frame - 10, fps, config: {damping: 18, stiffness: 120}});
  const leftSlide = interpolate(slideSpring, [0, 1], [-340, 0]);
  const rightSlide = interpolate(slideSpring, [0, 1], [340, 0]);
  const slideOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // --- slight overshoot bounce on settle -------------------------------------
  const settle = spring({frame: frame - 38, fps, config: {damping: 10, stiffness: 180}});
  const settleScale = interpolate(settle, [0, 1], [1.06, 1]);

  // --- connector appears after overlap ----------------------------------------
  const connOpacity = interpolate(frame, [42, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const connSpring = spring({frame: frame - 42, fps, config: {damping: 14, stiffness: 160}});
  const connScaleY = interpolate(connSpring, [0, 1], [0, 1]);

  // --- wordmark --------------------------------------------------------------
  const wordSpring = spring({frame: frame - 56, fps, config: {damping: 15}});
  const wordY = interpolate(wordSpring, [0, 1], [28, 0]);
  const wordOpacity = interpolate(frame, [56, 78], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <LogoSvg logo={logo}>
      {/* Left circle slides right */}
      {leftCircle ? (
        <g
          opacity={slideOpacity}
          style={{
            transform: `translateX(${leftSlide}px) scale(${settleScale})`,
            transformOrigin: originOf(logo, 'mark-left'),
          }}
        >
          <RawLayer logo={logo} id="mark-left" />
        </g>
      ) : null}

      {/* Right circle slides left */}
      {rightCircle ? (
        <g
          opacity={slideOpacity}
          style={{
            transform: `translateX(${rightSlide}px) scale(${settleScale})`,
            transformOrigin: originOf(logo, 'mark-right'),
          }}
        >
          <RawLayer logo={logo} id="mark-right" />
        </g>
      ) : null}

      {/* Connector reveals after connection */}
      {connector ? (
        <g
          opacity={connOpacity}
          style={{
            transform: `scaleY(${connScaleY})`,
            transformOrigin: originOf(logo, 'connector'),
          }}
        >
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
