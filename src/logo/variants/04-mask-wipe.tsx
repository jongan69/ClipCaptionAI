import React from 'react';
import {interpolate} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'mask-wipe',
  name: 'Mask Wipe',
  durationInFrames: 120,
  description:
    'A diagonal wipe reveals the logo from left to right, then settles into crisp readability.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame}) => {
  const brackets = logo.layer('brackets');
  const mark = logo.layer('l-mark');
  const card = logo.layer('card');
  const wordmark = logo.layer('wordmark');

  const wipe = interpolate(frame, [0, 95], [-920, logo.width + 980], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <LogoSvg logo={logo}>
      <defs>
        <clipPath id="logoWipe">
          <rect
            x={wipe}
            y={-120}
            width={logo.width + 420}
            height={logo.height + 420}
            transform={`rotate(-24 ${logo.width / 2} ${logo.height / 2})`}
          />
        </clipPath>
      </defs>

      <g opacity={interpolate(frame, [26, 36], [0.2, 1])} clipPath="url(#logoWipe)">
        {brackets ? <RawLayer logo={logo} id="brackets" /> : null}
        {mark ? <RawLayer logo={logo} id="l-mark" /> : null}
        {card ? <RawLayer logo={logo} id="card" /> : null}
        {wordmark ? <RawLayer logo={logo} id="wordmark" /> : null}
      </g>
    </LogoSvg>
  );
};

export default Variant;
