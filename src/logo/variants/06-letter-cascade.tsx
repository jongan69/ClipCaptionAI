import React from 'react';
import {interpolate, spring} from 'remotion';
import {LogoSvg, RawLayer} from '../logo-stage';
import {approxPathLength, originOf} from '../load-logo';
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'letter-cascade',
  name: 'Letter Cascade',
  durationInFrames: 120,
  description:
    'The wordmark splits into chunks that rise and fade one-by-one, while core artwork lands first.',
};

const Variant: React.FC<LogoVariantProps> = ({logo, frame, fps}) => {
  const brackets = logo.layer('brackets');
  const lMark = logo.layer('l-mark');
  const card = logo.layer('card');
  const wordmark = logo.layer('wordmark');

  const markAnim = spring({frame: frame - 12, fps, config: {damping: 18, stiffness: 150}});
  const markScale = interpolate(markAnim, [0, 1], [0.88, 1]);
  const markY = interpolate(markAnim, [0, 1], [18, 0]);
  const markOpacity = interpolate(frame, [12, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cardDrop = spring({frame: frame - 24, fps, config: {damping: 16, stiffness: 130}});
  const cardY = interpolate(cardDrop, [0, 1], [24, 0]);
  const cardOpacity = interpolate(frame, [24, 42], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const wordIn = spring({frame: frame - 36, fps, config: {damping: 14}});
  const wordGate = interpolate(wordIn, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const wordmarkPieces = (wordmark?.markup.match(/<text[\s\S]*?<\/text>/g) ?? []).filter(Boolean);

  const bracketPaths = [...(brackets?.markup.matchAll(/<path[^>]*\sd="([^"]+)"/g) ?? [])].map(
    (m) => m[1]
  );
  const dashLen = Math.max(...(bracketPaths.length ? bracketPaths.map(approxPathLength) : [120]));

  return (
    <LogoSvg logo={logo}>
      {brackets ? (
        <g
          fill="none"
          stroke={brackets.stroke ?? logo.brand.palette.primary}
          strokeWidth={brackets.strokeWidth ?? 14}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {bracketPaths.map((d, i) => {
            const draw = interpolate(frame, [i * 4, i * 4 + 20], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return <path key={d} d={d} strokeDasharray={dashLen} strokeDashoffset={dashLen * (1 - draw)} />;
          })}
        </g>
      ) : null}

      {lMark ? (
        <g opacity={markOpacity} style={{transform: `translateY(${markY}px) scale(${markScale})`, transformOrigin: originOf(logo, 'l-mark')}}>
          <RawLayer logo={logo} id="l-mark" />
        </g>
      ) : null}

      {card ? (
        <g opacity={cardOpacity} style={{transform: `translateY(${cardY}px)`}}>
          <RawLayer logo={logo} id="card" />
        </g>
      ) : null}

      {wordmark ? (
        <g opacity={wordGate}>
          {wordmarkPieces.length ? (
            wordmarkPieces.map((piece, i) => {
              const nodeIn = interpolate(frame, [40 + i * 6, 62 + i * 6], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              const rise = interpolate(nodeIn, [0, 1], [18, 0]);
              const opacity = interpolate(nodeIn, [0, 1], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              return (
                <g
                  key={piece.match(/id="([^"]+)"/)?.[1] ?? `word-piece-${i}`}
                  opacity={opacity}
                  style={{transform: `translateY(${rise}px)`, transformOrigin: originOf(logo, 'wordmark')}}
                >
                  <g dangerouslySetInnerHTML={{__html: piece}} />
                </g>
              );
            })
          ) : (
            <RawLayer logo={logo} id="wordmark" />
          )}
        </g>
      ) : null}
    </LogoSvg>
  );
};

export default Variant;
