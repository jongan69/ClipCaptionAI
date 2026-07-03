import {Composition} from 'remotion';
import {CaptionedClip, captionedClipDefaultProps} from './captioned-clip';
import type {CaptionedClipProps} from './types';

export const Root = () => {
  return (
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
  );
};
