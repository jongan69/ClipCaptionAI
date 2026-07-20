import React from 'react';
import {interpolate} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'depth-parallax',
  name: 'Depth Parallax',
  durationInFrames: 120,
  description:
    'Layered depth pass: distant elements travel first, then settle at full density and scale.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame}) => {
  const progress = interpolate(frame, [0, 85], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const settle = interpolate(frame, [78, 118], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const bgSweep = interpolate(progress, [0, 1], [1.08, 1]);
  const bracketDepth = interpolate(progress, [0, 1], [22, 0]);
  const markDepth = interpolate(progress, [0, 1], [16, 0]);
  const cardDepth = interpolate(progress, [0, 1], [28, 0]);
  const wordDepth = interpolate(progress, [0, 1], [34, 0]);
  const settlePulse = interpolate(settle, [0, 1], [0.985, 1]);
  const markScale = interpolate(settle, [0, 1], [0.94, 1]);
  const cardScale = interpolate(settle, [0, 1], [1.06, 1]);
  const wordScale = interpolate(settle, [0, 1], [0.96, 1]);

  return (
    <LogoSvg logo={logo}>
      <g
        style={{
          transform: `scale(${bgSweep})`,
          transformOrigin: originOf(logo, 'wordmark'),
          opacity: interpolate(progress, [0, 1], [0.85, 1]),
        }}
      >
        {logo.layer('brackets') ? (
          <g
            style={{
              transform: `translate(${bracketDepth / 1.8}px, ${bracketDepth}px)`,
            }}
          >
            <RawLayer logo={logo} id="brackets" />
          </g>
        ) : null}

        <g
          style={{
            transform: `translate(${markDepth / 3}px, ${markDepth}px) scale(${markScale})`,
            transformOrigin: originOf(logo, 'l-mark'),
          }}
        >
          <RawLayer logo={logo} id="l-mark" />
        </g>

        <g
          style={{
            transform: `translate(${cardDepth / 1.5}px, ${cardDepth / 2}px) scale(${cardScale})`,
            transformOrigin: originOf(logo, 'card'),
          }}
        >
          <RawLayer logo={logo} id="card" />
        </g>

        {logo.layer('wordmark') ? (
          <g
            style={{
              transform: `translate(${wordDepth}px, ${wordDepth / 1.2}px) scale(${wordScale})`,
              transformOrigin: originOf(logo, 'wordmark'),
              opacity: settle,
            }}
          >
            <RawLayer logo={logo} id="wordmark" />
          </g>
        ) : null}
      </g>

      <g
        opacity={interpolate(progress, [0.78, 1], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
        style={{
          transform: `scale(${settlePulse})`,
          transformOrigin: originOf(logo, 'l-mark'),
        }}
      >
        {logo.layer('brackets') ? <RawLayer logo={logo} id="brackets" /> : null}
      </g>
    </LogoSvg>
  );
};

export default Variant;
