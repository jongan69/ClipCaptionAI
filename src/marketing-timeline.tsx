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
    type: 'video' | 'image' | 'text' | 'slide-text' | 'end-card';
    startSeconds: number;
    durationSeconds: number;
    src?: string;
    text?: string;
    eyebrow?: string;
    headline?: string;
    body?: string;
    transition?: 'cut' | 'fade';
    sourceStartSeconds?: number;
    muted?: boolean;
    volume?: number;
    fit?: 'cover' | 'contain';
    motion?: 'none' | 'push-in' | 'pan-left' | 'pan-right';
    textPosition?: 'top' | 'center' | 'bottom';
  }>;
  captions: Array<{text: string; startSeconds: number; endSeconds: number; yPercent?: number}>;
  voice?: string;
  music?: string;
  musicVolume?: number;
  theme?: {
    backgroundColor: string;
    foregroundColor: string;
    accentColor: string;
  };
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

export const scheduledFrames = (
  entry: {startSeconds: number; durationSeconds: number},
  fps: number,
) => {
  const start = Math.round(entry.startSeconds * fps);
  const end = Math.max(start + 1, Math.round((entry.startSeconds + entry.durationSeconds) * fps));
  return {start, end, duration: end - start};
};

const TimelineEntry: React.FC<{
  entry: MarketingTimelineProps['timeline'][number];
  theme: NonNullable<MarketingTimelineProps['theme']>;
}> = ({entry, theme}) => {
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
  const progress = interpolate(frame, [0, Math.max(1, entry.durationSeconds * fps - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const transform =
    entry.motion === 'push-in'
      ? `scale(${1.02 + progress * 0.1})`
      : entry.motion === 'pan-left'
        ? `translateX(${3 - progress * 6}%) scale(1.1)`
        : entry.motion === 'pan-right'
          ? `translateX(${-3 + progress * 6}%) scale(1.1)`
          : undefined;
  if (entry.type === 'video' && entry.src)
    return (
      <OffthreadVideo
        src={entry.src}
        trimBefore={Math.round((entry.sourceStartSeconds ?? 0) * fps)}
        muted={entry.muted}
        volume={entry.volume ?? 1}
        style={{
          width: '100%',
          height: '100%',
          objectFit: entry.fit ?? 'cover',
          opacity,
          transform,
        }}
      />
    );
  if (entry.type === 'image' && entry.src)
    return (
      <Img
        src={entry.src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: entry.fit ?? 'cover',
          opacity,
          transform,
        }}
      />
    );
  if (entry.type === 'slide-text') {
    const position = entry.textPosition ?? 'bottom';
    return (
      <AbsoluteFill
        style={{
          justifyContent:
            position === 'top' ? 'flex-start' : position === 'center' ? 'center' : 'flex-end',
          background:
            position === 'top'
              ? `linear-gradient(180deg, ${theme.backgroundColor}ee 0%, ${theme.backgroundColor}99 42%, transparent 72%)`
              : position === 'center'
                ? `linear-gradient(180deg, transparent 8%, ${theme.backgroundColor}bb 32%, ${theme.backgroundColor}bb 68%, transparent 92%)`
                : `linear-gradient(180deg, transparent 22%, ${theme.backgroundColor}aa 64%, ${theme.backgroundColor}f5 100%)`,
          color: theme.foregroundColor,
          fontFamily: 'Inter, sans-serif',
          padding: position === 'top' ? '150px 72px 80px' : '100px 72px 190px',
          opacity,
        }}
      >
        {entry.eyebrow ? (
          <div
            style={{
              alignSelf: 'flex-start',
              backgroundColor: theme.accentColor,
              borderRadius: 999,
              color: theme.backgroundColor,
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: 3,
              marginBottom: 24,
              padding: '10px 18px',
            }}
          >
            {entry.eyebrow.toUpperCase()}
          </div>
        ) : null}
        <div
          style={{
            fontSize: 82,
            fontWeight: 900,
            letterSpacing: -3,
            lineHeight: 0.98,
            maxWidth: 940,
            textShadow: '0 4px 24px #000',
          }}
        >
          {entry.headline}
        </div>
        {entry.body ? (
          <div
            style={{
              fontSize: 38,
              fontWeight: 600,
              lineHeight: 1.2,
              marginTop: 24,
              maxWidth: 860,
              opacity: 0.92,
              textShadow: '0 3px 16px #000',
            }}
          >
            {entry.body}
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: entry.type === 'end-card' ? 'center' : 'flex-end',
        background:
          entry.type === 'end-card'
            ? `radial-gradient(circle at 50% 35%, ${theme.accentColor}55, ${theme.backgroundColor} 62%)`
            : `linear-gradient(180deg, transparent 35%, ${theme.backgroundColor}dd 100%)`,
        color: theme.foregroundColor,
        fontFamily: 'Inter, sans-serif',
        fontSize: 72,
        fontWeight: 800,
        padding: entry.type === 'end-card' ? 100 : '100px 80px 260px',
        textAlign: 'center',
        whiteSpace: 'pre-line',
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
  musicVolume = 0.08,
  theme = {
    backgroundColor: '#080b12',
    foregroundColor: '#ffffff',
    accentColor: '#3b82f6',
  },
  overlays = [],
}) => {
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const currentCaption = captions.find(
    (caption) => frame >= caption.startSeconds * fps && frame < caption.endSeconds * fps,
  );
  return (
    <AbsoluteFill style={{backgroundColor: theme.backgroundColor}}>
      {timeline.map((entry, index) => (
        <Sequence
          key={`${entry.startSeconds}-${index}`}
          from={scheduledFrames(entry, fps).start}
          durationInFrames={scheduledFrames(entry, fps).duration}
        >
          <TimelineEntry entry={entry} theme={theme} />
        </Sequence>
      ))}
      {overlays.map((entry, index) => (
        <Sequence
          key={`${entry.src}-${index}`}
          from={scheduledFrames(entry, fps).start}
          durationInFrames={scheduledFrames(entry, fps).duration}
        >
          <Img src={entry.src} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
        </Sequence>
      ))}
      {voice ? <Audio src={voice} /> : null}
      {music ? <Audio src={music} volume={musicVolume} /> : null}
      {currentCaption ? (
        <div
          style={{
            position: 'absolute',
            top: `${currentCaption.yPercent ?? 82}%`,
            left: '8%',
            right: '8%',
            transform: 'translateY(-50%)',
            color: theme.foregroundColor,
            backgroundColor: `${theme.backgroundColor}dd`,
            border: `2px solid ${theme.accentColor}`,
            borderRadius: 24,
            padding: '18px 28px',
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
