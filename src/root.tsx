import {Composition} from 'remotion';
import {z} from 'zod';
import {CaptionedClip, captionedClipDefaultProps} from './captioned-clip';
import type {CaptionedClipProps} from './types';
import {PromptVideo, promptVideoDefaultProps, type PromptVideoProps} from './prompt-video';
import {warnOnMissingFonts} from './fonts';
import {
  MarketingTimeline,
  marketingTimelineDefaultProps,
  scheduledFrames,
  type MarketingTimelineProps,
} from './marketing-timeline';

// Fail loudly on malformed caption payloads at the composition boundary —
// a missing startMs/endMs used to propagate NaN into interpolation and
// produce broken frames instead of an error.
const captionsSchema = z
  .array(
    z
      .object({
        text: z.string(),
        startMs: z.number(),
        endMs: z.number(),
      })
      .passthrough(),
  )
  .min(1);

const validateCaptionedClipProps = (props: CaptionedClipProps) => {
  const parsed = captionsSchema.safeParse(props.captions);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Invalid captions payload (${issue?.path.join('.') ?? 'root'}: ${issue?.message}): ` +
        'each caption needs a text string and finite startMs/endMs numbers.',
    );
  }
};

export const Root = () => {
  return (
    <>
      <Composition
        id="CaptionedClip"
        component={CaptionedClip}
        fps={30}
        width={1080}
        height={1920}
        durationInFrames={450}
        defaultProps={captionedClipDefaultProps}
        calculateMetadata={({props}: {props: CaptionedClipProps}) => {
          warnOnMissingFonts();
          validateCaptionedClipProps(props);
          return {
            fps: props.fps,
            width: props.width,
            height: props.height,
            durationInFrames: props.durationInFrames,
          };
        }}
      />
      <Composition
        id="PromptVideo"
        component={PromptVideo}
        fps={30}
        width={1920}
        height={1080}
        durationInFrames={120}
        defaultProps={promptVideoDefaultProps}
        calculateMetadata={({props}: {props: PromptVideoProps}) => ({
          fps: props.fps,
          width: props.width,
          height: props.height,
          durationInFrames: Math.max(
            1,
            Math.round(
              props.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) * props.fps,
            ),
          ),
        })}
      />
      <Composition
        id="MarketingTimeline"
        component={MarketingTimeline}
        fps={30}
        width={1080}
        height={1920}
        durationInFrames={450}
        defaultProps={marketingTimelineDefaultProps}
        calculateMetadata={({props}: {props: MarketingTimelineProps}) => {
          const scheduledEnd = Math.max(
            0,
            ...props.timeline.map((entry) => scheduledFrames(entry, props.fps).end),
            ...(props.overlays ?? []).map((entry) => scheduledFrames(entry, props.fps).end),
          );
          return {
            fps: props.fps,
            width: props.width,
            height: props.height,
            durationInFrames: Math.max(
              1,
              Math.round(props.durationSeconds * props.fps),
              scheduledEnd,
            ),
          };
        }}
      />
    </>
  );
};
