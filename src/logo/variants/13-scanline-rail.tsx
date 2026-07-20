import React from 'react';
import {interpolate} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {approxPathLength} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'scanline-rail',
  name: 'Scanline Rail',
  durationInFrames: 120,
  description: 'A moving rail scans through the composition, then the complete logo locks in.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame}) => {
  const brackets = logo.layer('brackets');

  const railY = interpolate(frame, [0, 76], [-140, logo.height + 140], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const railHeight = Math.max(logo.height * 0.2, 70);
  const railOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const settle = interpolate(frame, [70, 110], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const reveal = interpolate(frame, [28, 68], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const revealOpacity = interpolate(reveal, [0, 0.4, 1], [0.12, 1, 1]);

  const bracketPaths = [...(brackets?.markup.matchAll(/<path[^>]*\\sd="([^"]+)"/g) ?? [])].map(
    (m) => m[1]
  );
  const dashLen = Math.max(...(bracketPaths.length ? bracketPaths.map(approxPathLength) : [120]));

  return (
    <LogoSvg logo={logo}>
      <defs>
        <clipPath id={`scanlineRail-${logo.slug}`}>
          <rect x="-24" y={railY} width={logo.width + 48} height={railHeight} />
        </clipPath>
      </defs>

      <g opacity={revealOpacity * railOpacity} clipPath={`url(#scanlineRail-${logo.slug})`}>
        <g opacity={interpolate(frame, [22, 42], [0, 1], {extrapolateLeft: 'clamp'})}>
          {logo.layer('brackets') ? <RawLayer logo={logo} id="brackets" /> : null}
          {logo.layer('l-mark') ? <RawLayer logo={logo} id="l-mark" /> : null}
          {logo.layer('card') ? <RawLayer logo={logo} id="card" /> : null}
          {logo.layer('wordmark') ? <RawLayer logo={logo} id="wordmark" /> : null}
        </g>
      </g>

      <g opacity={settle}>
        {logo.layer('l-mark') ? (
          <RawLayer
            logo={logo}
            id="l-mark"
            style={{
              transform: `scale(${interpolate(settle, [0, 1], [1.05, 1])})`,
              transformOrigin: `${logo.width / 2}px ${logo.height / 2}px`,
            }}
          />
        ) : null}
        {logo.layer('card') ? <RawLayer logo={logo} id="card" /> : null}
        {logo.layer('wordmark') ? <RawLayer logo={logo} id="wordmark" /> : null}
      </g>

      {brackets ? (
        <g
          fill="none"
          stroke={brackets.stroke ?? logo.brand.palette.primary}
          strokeWidth={(brackets.strokeWidth ?? 14) * 0.95}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={interpolate(frame, [56, 72], [0, 0.9], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })}
        >
          {bracketPaths.map((d, i) => {
            const draw = interpolate(frame, [38 + i * 4, 56 + i * 4], [0, 1], {
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
