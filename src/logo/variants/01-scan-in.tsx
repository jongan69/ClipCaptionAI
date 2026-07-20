import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {approxPathLength, originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

/**
 * REFERENCE VARIANT — this is the worked example the model should pattern-match.
 *
 * Note what it never does: mention ListingOS, hardcode a path, or assume a layer
 * exists. Every number is derived from the spec via the `logo` prop.
 */
export const meta = {
  id: 'scan-in',
  name: 'Scan In',
  durationInFrames: 120,
  description:
    'Corner brackets draw on like a scanner acquiring a target, the mark fades up inside them, wordmark rises last.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const brackets = logo.layer('brackets');
  const wordmark = logo.layer('wordmark');

  // --- brackets draw on, staggered per corner -------------------------------
  const bracketPaths = [...(brackets?.markup.matchAll(/<path[^>]*\sd="([^"]+)"/g) ?? [])].map(
    (m) => m[1]
  );
  const dashLen = Math.max(...bracketPaths.map(approxPathLength), 100) * 1.4;

  // --- mark (L + card) fades and scales up ----------------------------------
  const markIn = spring({frame: frame - 18, fps, config: {damping: 200}});
  const markScale = interpolate(markIn, [0, 1], [0.86, 1]);
  const markOpacity = interpolate(frame, [18, 34], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // --- card gets a slight extra beat so it reads as a separate object -------
  const cardIn = spring({frame: frame - 28, fps, config: {damping: 14, stiffness: 120}});
  const cardShift = interpolate(cardIn, [0, 1], [16, 0]);

  // --- wordmark rises last ---------------------------------------------------
  const wordIn = spring({frame: frame - 46, fps, config: {damping: 18}});
  const wordY = interpolate(wordIn, [0, 1], [26, 0]);
  const wordOpacity = interpolate(frame, [46, 64], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <LogoSvg logo={logo}>
      {brackets ? (
        <g
          fill="none"
          stroke={brackets.stroke ?? logo.brand.palette.primary}
          strokeWidth={brackets.strokeWidth ?? 15}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {bracketPaths.map((d, i) => {
            const draw = interpolate(frame, [i * 4, i * 4 + 20], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <path
                key={d}
                d={d}
                strokeDasharray={dashLen}
                strokeDashoffset={dashLen * (1 - draw)}
              />
            );
          })}
        </g>
      ) : null}

      <g
        opacity={markOpacity}
        style={{
          transform: `scale(${markScale})`,
          transformOrigin: originOf(logo, 'l-mark'),
        }}
      >
        <RawLayer logo={logo} id="l-mark" />
        <RawLayer
          logo={logo}
          id="card"
          style={{transform: `translateY(${cardShift}px)`}}
        />
      </g>

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
