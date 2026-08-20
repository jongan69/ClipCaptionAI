import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export type MarketingTimelineProps = {
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  timeline: Array<{
    type: 'video' | 'image' | 'text' | 'end-card';
    startSeconds: number;
    durationSeconds: number;
    src?: string;
    text?: string;
    transition?: 'cut' | 'fade';
  }>;
  captions: Array<{text: string; startSeconds: number; endSeconds: number; yPercent?: number}>;
  voice?: string;
  music?: string;
  overlays?: Array<{src: string; startSeconds: number; durationSeconds: number}>;
};

export const marketingTimelineDefaultProps: MarketingTimelineProps = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationSeconds: 15,
  timeline: [{type: 'end-card', startSeconds: 12, durationSeconds: 3, text: 'Learn more'}],
  captions: [],
};

const TimelineEntry: React.FC<{entry: MarketingTimelineProps['timeline'][number]}> = ({entry}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fadeFrames = Math.min(fps / 3, (entry.durationSeconds * fps) / 2);
  const opacity =
    entry.transition === 'fade'
      ? interpolate(
          frame,
          [0, fadeFrames, entry.durationSeconds * fps - fadeFrames, entry.durationSeconds * fps],
          [0, 1, 1, 0],
          {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
        )
      : 1;
  if (entry.type === 'video' && entry.src)
    return (
      <OffthreadVideo
        src={entry.src}
        style={{width: '100%', height: '100%', objectFit: 'cover', opacity}}
      />
    );
  if (entry.type === 'image' && entry.src)
    return (
      <Img src={entry.src} style={{width: '100%', height: '100%', objectFit: 'cover', opacity}} />
    );
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: entry.type === 'end-card' ? '#080b12' : 'transparent',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
        fontSize: 72,
        fontWeight: 800,
        padding: 80,
        textAlign: 'center',
        opacity,
      }}
    >
      {entry.text}
    </AbsoluteFill>
  );
};

export const MarketingTimeline: React.FC<MarketingTimelineProps> = ({
  timeline,
  captions,
  voice,
  music,
  overlays = [],
}) => {
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const currentCaption = captions.find(
    (caption) => frame >= caption.startSeconds * fps && frame < caption.endSeconds * fps,
  );
  return (
    <AbsoluteFill style={{backgroundColor: 'black'}}>
      {timeline.map((entry, index) => (
        <Sequence
          key={`${entry.startSeconds}-${index}`}
          from={Math.round(entry.startSeconds * fps)}
          durationInFrames={Math.round(entry.durationSeconds * fps)}
        >
          <TimelineEntry entry={entry} />
        </Sequence>
      ))}
      {overlays.map((entry, index) => (
        <Sequence
          key={`${entry.src}-${index}`}
          from={Math.round(entry.startSeconds * fps)}
          durationInFrames={Math.round(entry.durationSeconds * fps)}
        >
          <Img src={entry.src} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
        </Sequence>
      ))}
      {voice ? <Audio src={voice} /> : null}
      {music ? <Audio src={music} volume={0.2} /> : null}
      {currentCaption ? (
        <div
          style={{
            position: 'absolute',
            top: `${currentCaption.yPercent ?? 82}%`,
            left: '8%',
            right: '8%',
            transform: 'translateY(-50%)',
            color: 'white',
            fontFamily: 'Inter, sans-serif',
            fontSize: 58,
            fontWeight: 800,
            textAlign: 'center',
            textShadow: '0 3px 12px #000',
          }}
        >
          {currentCaption.text}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
