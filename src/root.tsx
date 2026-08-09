import {Composition} from 'remotion';
import {CaptionedClip, captionedClipDefaultProps} from './captioned-clip';
import type {CaptionedClipProps} from './types';
import {PromptVideo, promptVideoDefaultProps, type PromptVideoProps} from './prompt-video';

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
        durationInFrames: Math.max(1, Math.round(props.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) * props.fps)),
      })}
    />
    </>
  );
};
