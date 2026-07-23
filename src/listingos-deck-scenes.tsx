import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CSSProperties} from 'react';

type Keyframe = {
  text: string;
  y: number;
  delay: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const showPulse = (
  frame: number,
  start: number,
  end: number,
  fps: number,
  hold = 0.4,
): number => {
  const t = clamp01((frame / fps - start) / Math.max(0.001, end - start));
  return interpolate(
    t,
    [0, Math.min(0.15, hold / 2), hold, 1],
    [0, 1, 1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );
};

const fade = (frame: number, start: number, end: number, fps: number) => {
  return interpolate(
    clamp01((frame / fps - start) / Math.max(0.001, end - start)),
    [0, 0.18, 0.9, 1],
    [0, 1, 1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );
};

const progress = (frame: number, start: number, end: number, fps: number) =>
  clamp01((frame / fps - start) / Math.max(0.001, end - start));

const sceneBg = `radial-gradient(circle at 20% 15%, #1b3366 2%, #0b1323 35%, #070b16 100%)`;

const palette = {
  text: '#e8f0ff',
  muted: '#a9b8dc',
  accent: '#45f2ff',
  accent2: '#66ffc9',
  accent3: '#ffce5f',
  accentWarn: '#ff6f8d',
  panel: 'rgba(10, 16, 30, 0.82)',
  panelStrong: 'rgba(12, 19, 36, 0.92)',
};

const baseText: CSSProperties = {
  fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
  color: palette.text,
  lineHeight: 1.15,
};

const labelText: CSSProperties = {
  ...baseText,
  color: palette.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.11em',
  fontSize: 20,
};

const cardBase: CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.18)',
  background: palette.panel,
  boxShadow: '0 18px 42px rgba(0,0,0,0.35)',
  color: palette.text,
};

const stageTitle = (text: string): CSSProperties => ({
  ...labelText,
  position: 'absolute',
  top: 18,
  left: 0,
  right: 0,
  textAlign: 'center',
  pointerEvents: 'none',
  color: palette.muted,
});

const sceneFooter: CSSProperties = {
  ...labelText,
  position: 'absolute',
  right: 20,
  bottom: 14,
  fontSize: 13,
  color: palette.muted,
  opacity: 0.85,
};

const SceneShell: React.FC<{label: string; footer?: string; children: React.ReactNode}> = ({
  label,
  footer,
  children,
}) => {
  return (
    <AbsoluteFill style={{background: sceneBg}}>
      <div style={stageTitle(label)}>{label}</div>
      {children}
      <div style={sceneFooter}>{footer ?? 'ListingOS · Camera-first listing workflow'}</div>
    </AbsoluteFill>
  );
};

const AnimatedPanel: React.FC<{
  children: React.ReactNode;
  left: number;
  top: number;
  width: number;
  opacity: number;
  delayMs?: number;
}> = ({children, left, top, width, opacity, delayMs = 0}) => {
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const reveal = fade(frame, 0 + delayMs / 1000, 7 + delayMs / 1000, fps);
  const y = interpolate(reveal, [0, 1], [14, 0]);

  return (
    <div
      style={{
        ...cardBase,
        position: 'absolute',
        left,
        top,
        width,
        padding: '20px 22px',
        opacity: opacity * reveal,
        transform: `translateY(${y}px)`,
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  );
};

const H1: React.FC<{text: string; size?: number}> = ({text, size = 56}) => (
  <div
    style={{
      ...baseText,
      fontSize: size,
      letterSpacing: '0.01em',
      fontWeight: 800,
      color: palette.text,
    }}
  >
    {text}
  </div>
);

const H2: React.FC<{text: string; color?: string; size?: number}> = ({
  text,
  color = palette.muted,
  size = 22,
}) => (
  <div
    style={{
      ...baseText,
      color,
      fontSize: size,
      fontWeight: 650,
      marginTop: 8,
    }}
  >
    {text}
  </div>
);

export const ListingOSProblemGapScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const cardA = showPulse(frame, 0.25, 1.0, fps, 0.55);
  const cardB = showPulse(frame, 1.0, 1.8, fps, 0.55);
  const cardC = showPulse(frame, 1.6, 2.4, fps, 0.64);

  const barT = progress(frame, 0.9, 2.05, fps);
  const leftText = interpolate(barT, [0, 1], [0, -10]);
  const rightText = interpolate(barT, [0, 1], [8, 0]);

  const ratio = Math.min(1, barT * 1.8);

  return (
    <SceneShell label="The Problem" footer="Seller workflows still lose time in manual steps">
      <div
        style={{
          position: 'absolute',
          top: 88,
          left: 100,
          right: 100,
          ...baseText,
          color: palette.muted,
          fontSize: 30,
          textAlign: 'center',
          fontWeight: 600,
        }}
      >
        Photographing is fast. Turning it into a live listing is not.
      </div>

      <AnimatedPanel
        left={110}
        top={190}
        width={560}
        opacity={cardA}
      >
        <H1 text="20s" size={70} />
        <H2 text="Photo capture" />
        <div style={{...baseText, color: palette.muted, marginTop: 8}}>Quick input step</div>
      </AnimatedPanel>

      <AnimatedPanel
        left={1110}
        top={190}
        width={700}
        opacity={cardB}
      >
        <H1 text="5–10m" size={70} />
        <H2 text="Manual listing workflow" />
        <div style={{...baseText, color: palette.muted, marginTop: 8}}>Drafts, details, photos, pricing, publish</div>
      </AnimatedPanel>

      <div
        style={{
          position: 'absolute',
          left: 190,
          top: 330,
          right: 190,
          height: 36,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.18)',
          background: 'rgba(8,14,28,0.6)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${30 + ratio * 58}%`,
            background: 'linear-gradient(90deg, #3f53d0 0%, #6de9ff 100%)',
            boxShadow: 'inset 0 0 18px rgba(255,255,255,0.2)',
            transition: 'width 150ms linear',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -38,
            left: `${30 + ratio * 58 - 4}%`,
            opacity: fade(frame, 1.4, 2.15, fps),
            transform: 'translateX(-50%)',
            color: palette.accent3,
            ...baseText,
            fontSize: 18,
          }}
        >
          gap in workflow speed
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 340,
          top: 440,
          right: 340,
          borderBottom: '1px dashed rgba(255,255,255,0.2)',
        }}
      >
        <div
          style={{
            width: `${Math.min(100, ratio * 92)}%`,
            maxWidth: '100%',
            borderBottom: `2px solid ${palette.accent}`,
            transform: `translateX(${leftText}px)`,
          }}
        />
      </div>

      <AnimatedPanel
        left={270}
        top={470}
        width={1380}
        opacity={cardC}
      >
        <H1 text="ListingOS closes the gap" size={58} />
        <H2
          text="Camera-first AI agent → verified draft → publish"
          color={palette.accent}
          size={28}
        />
        <div style={{...baseText, color: palette.muted, marginTop: 12, fontSize: 24}}>
          One phone session, one verified path, immediate output.
        </div>
      </AnimatedPanel>

      <div
        style={{
          ...baseText,
          position: 'absolute',
          left: 0,
          right: 0,
          top: 820,
          textAlign: 'center',
          color: palette.muted,
          opacity: cardC * 0.9,
          transform: `translateY(${interpolate(cardC, [0,1],[12,0])}px)`,
        }}
      >
        The biggest bottleneck is moving from photos to a publish-ready draft.
      </div>
    </SceneShell>
  );
};

const FlowNode: React.FC<{
  left: number;
  top: number;
  text: string;
  color: string;
  sub: string;
  delay: number;
}> = ({left, top, text, color, sub, delay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const state = progress(frame, delay, delay + 1.2, fps);

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: 300,
        height: 120,
        borderRadius: 18,
        border: `1px solid ${color}88`,
        background: `${color}20`,
        transform: `translate(${interpolate(state, [0, 1], [0, 0])}px, ${interpolate(
          state,
          [0, 1],
          [24, 0],
        )}px)`,
        opacity: state,
        boxShadow: `0 16px 34px rgba(0,0,0,0.30)`,
      }}
    >
      <div
        style={{
          ...baseText,
          color,
          fontWeight: 800,
          fontSize: 30,
          position: 'absolute',
          top: 15,
          left: 20,
          right: 20,
        }}
      >
        {text}
      </div>
      <div
        style={{
          ...baseText,
          color: palette.muted,
          position: 'absolute',
          top: 65,
          left: 20,
          right: 20,
          fontSize: 18,
        }}
      >
        {sub}
      </div>
    </div>
  );
};

export const ListingOSPipelineScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const steps = [
    {
      left: 95,
      text: 'Capture',
      sub: 'Photo intake from phone',
      color: palette.accent,
      delay: 0.15,
    },
    {
      left: 445,
      text: 'Analyze',
      sub: 'OpenAI structured inference',
      color: palette.accent2,
      delay: 0.55,
    },
    {
      left: 785,
      text: 'Verify',
      sub: 'evidence checks + schema validation',
      color: palette.accent3,
      delay: 0.95,
    },
    {
      left: 1125,
      text: 'Review',
      sub: 'Seller approval on phone',
      color: palette.text,
      delay: 1.35,
    },
    {
      left: 1465,
      text: 'Publish',
      sub: 'eBay Inventory API',
      color: palette.accent,
      delay: 1.75,
    },
  ];

  return (
    <SceneShell
      label="Workflow"
      footer="Capture → Analyze → Verify → Review → Publish"
    >
      <div
        style={{
          ...baseText,
          textAlign: 'center',
          marginTop: 90,
          fontSize: 46,
          color: palette.text,
          fontWeight: 800,
        }}
      >
        <div style={{position: 'absolute', top: 100, left: 0, right: 0}}>
          The 5-step listing pipeline
        </div>
      </div>

      {steps.map((step) => (
        <FlowNode
          key={step.text}
          left={step.left}
          top={340}
          text={step.text}
          sub={step.sub}
          color={step.color}
          delay={step.delay}
        />
      ))}

      {steps.map((step, index) => {
        if (index === steps.length - 1) {
          return null;
        }

        const start = step.delay + 0.35;
        const line = interpolate(
          clamp01((frame / fps - start) / 0.8),
          [0, 0.15, 1],
          [0, 1, 1],
        );

        return (
          <div
            key={`${step.text}-arrow`}
            style={{
              position: 'absolute',
              top: 400,
              left: step.left + 300,
              width: 145,
              height: 2,
              background: `linear-gradient(90deg, rgba(255,255,255,0.9), rgba(255,255,255,0))`,
              transform: `scaleX(${line})`,
              transformOrigin: 'left',
              opacity: line,
            }}
          >
            <div
              style={{
                position: 'absolute',
                right: -14,
                top: -5,
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                borderLeft: `14px solid ${palette.text}`,
              }}
            />
          </div>
        );
      })}

      <div
        style={{
          position: 'absolute',
          left: 90,
          right: 90,
          top: 530,
          height: 180,
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(7, 12, 24, 0.7)',
          padding: 18,
          ...baseText,
        }}
      >
        <div style={{color: palette.accent3, fontWeight: 800, fontSize: 30}}>
          The AI turns photos into a structured, review-ready draft automatically.
        </div>
        <div style={{marginTop: 12, color: palette.muted, fontSize: 22, lineHeight: 1.35}}>
          The long-running work is async in the background; the seller moves to next item instead of waiting.
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 620,
          top: 760,
          ...baseText,
          color: palette.text,
          fontSize: 52,
          fontWeight: 800,
          opacity: fade(frame, 2.3, 2.9, fps),
        }}
      >
        Fast UX, real API integration.
      </div>

      <div
        style={{
          position: 'absolute',
          width: 26,
          height: 26,
          borderRadius: 999,
          background: palette.accentWarn,
          left: interpolate(frame / fps, [0.5, 4, 4.9], [95, 1860, 1780]),
          top: interpolate(frame / fps, [0.5, 4, 4.9], [455, 455, 540]),
          opacity: fade(frame, 0.8, 4.9, fps),
          boxShadow: '0 0 12px 4px rgba(255, 111, 141, 0.45)',
        }}
      />
    </SceneShell>
  );
};

export const ListingOSEvidenceGateScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const row1 = progress(frame, 0.35, 0.95, fps);
  const row2 = progress(frame, 0.7, 1.25, fps);
  const row3 = progress(frame, 1.05, 1.6, fps);
  const score = interpolate(progress(frame, 1.35, 2.15, fps), [0, 1], [0.18, 0.94]);
  const status = score > 0.72;

  const rowData = [
    {
      label: 'Live eBay comparables',
      sub: 'sold items, recent windows, grade and category filters',
      color: palette.accent,
      p: row1,
    },
    {
      label: 'Catalog + image evidence',
      sub: 'graded card metadata checked against trusted sources',
      color: palette.accent2,
      p: row2,
    },
    {
      label: 'Structured output validation',
      sub: 'worker validates schema before persistence',
      color: palette.accent3,
      p: row3,
    },
  ];

  return (
    <SceneShell label="Evidence-Based Gate" footer="Show confidence clearly; escalate edge cases">
      <div
        style={{
          ...baseText,
          textAlign: 'center',
          marginTop: 90,
          width: '100%',
          position: 'absolute',
          top: 95,
          left: 0,
          fontSize: 50,
          fontWeight: 800,
          color: palette.text,
        }}
      >
        No guesswork on weak evidence
      </div>

      <div
        style={{
          position: 'absolute',
          left: 80,
          top: 210,
          width: 820,
        }}
      >
        {rowData.map((row) => (
          <div
            key={row.label}
            style={{
              ...cardBase,
              marginBottom: 16,
              padding: '18px 22px',
              borderColor: `${row.color}66`,
              opacity: row.p,
              transform: `translateX(${interpolate(row.p, [0, 1], [-20, 0])}px)`,
            }}
          >
            <div
              style={{
                ...baseText,
                color: row.color,
                fontWeight: 800,
                fontSize: 30,
                letterSpacing: '0.01em',
              }}
            >
              {row.label}
            </div>
            <div
              style={{
                ...baseText,
                marginTop: 8,
                color: palette.muted,
                fontSize: 22,
              }}
            >
              {row.sub}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          ...cardBase,
          position: 'absolute',
          right: 74,
          top: 220,
          width: 880,
          height: 540,
          padding: 20,
        }}
      >
        <div
          style={{
            ...baseText,
            color: palette.muted,
            textAlign: 'center',
            fontSize: 20,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Confidence score
        </div>

        <div
          style={{
            marginTop: 24,
            height: 32,
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.25)',
            overflow: 'hidden',
            background: 'rgba(5, 10, 20, 0.8)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${score * 100}%`,
              background: 'linear-gradient(90deg, #ff6d89, #f5c85f, #7bff95)',
              boxShadow: `0 0 18px rgba(123,255,149,0.22)`,
            }}
          />
        </div>

        <div
          style={{
            ...baseText,
            marginTop: 14,
            fontSize: 30,
            color: palette.accent,
            fontWeight: 800,
          }}
        >
          {Math.round(score * 100)}% evidence maturity
        </div>

        <div
          style={{
            marginTop: 26,
            fontSize: 54,
            fontWeight: 800,
            color: status ? palette.accent2 : palette.accentWarn,
            opacity: fade(frame, 1.7, 2.5, fps),
            letterSpacing: '0.02em',
            textAlign: 'center',
          }}
        >
          {status ? 'PUBLISH' : 'REFUSE TO GUESS'}
        </div>

        <div
          style={{
            ...baseText,
            marginTop: 18,
            color: palette.muted,
            fontSize: 24,
            textAlign: 'center',
          }}
        >
          This is the moat: refusal is as important as the listing output.
        </div>
      </div>
    </SceneShell>
  );
};

export const ListingOSScaleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const steps = [
    {label: 'Capture', sub: 'Next item starts immediately', delay: 0.2},
    {label: 'Analyze', sub: 'Background processing happens now', delay: 0.55},
    {label: 'Verify', sub: 'Checks apply to new data', delay: 0.9},
    {label: 'Review', sub: 'Only edits needed by seller', delay: 1.25},
    {label: 'Publish', sub: 'Output gets faster over time', delay: 1.6},
  ];

  const trend = progress(frame, 0.5, 2.3, fps);

  return (
    <SceneShell label="Scale" footer="Every published listing improves the next one">
      <div
        style={{
          ...baseText,
          position: 'absolute',
          top: 100,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontWeight: 800,
          fontSize: 52,
          color: palette.text,
        }}
      >
        Every published listing lowers marginal cost
      </div>

      <div
        style={{
          position: 'absolute',
          left: 80,
          right: 80,
          top: 205,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 18,
        }}
      >
        {steps.map((step, index) => {
          const t = progress(frame, step.delay, step.delay + 1.1, fps);
          const scale = interpolate(t, [0, 1], [0.96, 1]);
          const isLast = index === steps.length - 1;

          return (
            <div
              key={step.label}
              style={{
                ...cardBase,
                padding: '28px 14px',
                borderColor: isLast ? `${palette.accent2}AA` : 'rgba(255,255,255,0.2)',
                opacity: t,
                transform: `scale(${scale}) translateY(${interpolate(t, [0, 1], [10, 0])}px)`,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  ...baseText,
                  color: isLast ? palette.accent2 : palette.text,
                  fontWeight: 800,
                  fontSize: 34,
                }}
              >
                {step.label}
              </div>
              <div
                style={{
                  ...baseText,
                  marginTop: 12,
                  color: palette.muted,
                  fontSize: 20,
                }}
              >
                {step.sub}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 190,
          top: 585,
          right: 190,
          height: 130,
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.12)',
          background: palette.panel,
          padding: '18px 24px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            ...baseText,
            color: palette.accent,
            fontWeight: 800,
            fontSize: 32,
          }}
        >
          Network effect in practice
        </div>

        <div
          style={{
            ...baseText,
            marginTop: 12,
            color: palette.muted,
            fontSize: 24,
          }}
        >
          More listings = stronger reference set, better pricing confidence, fewer weak-guess fallbacks.
        </div>

        <div
          style={{
            marginTop: 18,
            height: 16,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.12)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${40 + trend * 56}%`,
              background: 'linear-gradient(90deg, #2f7cff, #7ef0ff)',
            }}
          />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          width: 18,
          height: 18,
          borderRadius: 999,
          background: palette.accent3,
          left: 170,
          top: 770,
          opacity: progress(frame, 1.1, 2.0, fps),
          transform: `translateX(${interpolate(progress(frame, 1.1, 2.0, fps), [0, 1], [0, 1520])}px)`,
        }}
      />
    </SceneShell>
  );
};

const Keyframes: Keyframe[] = [
  {text: 'Photos in.', y: 340, delay: 0.15},
  {text: 'Listing out.', y: 450, delay: 0.9},
  {text: 'listingos.expo.app', y: 560, delay: 1.9},
];

export const ListingOSOutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const glow = progress(frame, 0.2, 2.2, fps);

  return (
    <SceneShell
      label="Next Steps"
      footer="Hard stop after two-second hold"
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 250,
          textAlign: 'center',
          ...baseText,
          color: palette.text,
          fontWeight: 800,
          fontSize: 82,
          letterSpacing: '0.01em',
        }}
      >
        {Keyframes.map((row) => {
          const a = fade(frame, row.delay, row.delay + 0.75, fps);
          return (
            <div
              key={row.text}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: row.y,
                color: row.text === 'listingos.expo.app' ? palette.accent2 : palette.text,
                opacity: a,
                transform: `translateY(${interpolate(a, [0, 1], [12, 0])}px)`,
              }}
            >
              {row.text}
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '65%',
          width: '86%',
          height: '42%',
          transform: 'translate(-50%, -35%)',
          borderRadius: 999,
          border: `1px solid rgba(125, 242, 255, ${0.2 + glow * 0.55})`,
          boxShadow: `0 0 ${80 + glow * 110}px rgba(125, 242, 255, ${0.16 + glow * 0.28})`,
          opacity: glow,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 680,
          textAlign: 'center',
          ...baseText,
          color: palette.muted,
          fontSize: 26,
          opacity: fade(frame, 2.6, 3.1, fps),
        }}
      >
        The repo is public.
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 740,
          textAlign: 'center',
          ...labelText,
          color: palette.accent,
          opacity: fade(frame, 2.95, 3.6, fps),
        }}
      >
        Final proof: a complete, reviewable flow from camera to publish.
      </div>
    </SceneShell>
  );
};
