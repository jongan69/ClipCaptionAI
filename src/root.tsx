import {Composition} from 'remotion';
import {CaptionedClip, captionedClipDefaultProps} from './captioned-clip';
import type {CaptionedClipProps} from './types';
import {compositionMatrix} from './logo/registry';
import {LogoStage} from './logo/logo-stage';

export const Root = () => {
  return (
    <>
    {/* One composition per brand x logo-animation variant. */}
    {compositionMatrix().map((entry) => (
      <Composition
        key={entry.id}
        id={entry.id}
        component={
          ((() => {
            const Stage = () => <LogoStage logo={entry.logo} variant={entry.component} />;
            return Stage;
          })() as unknown) as typeof LogoStage
        }
        fps={30}
        width={1080}
        height={1080}
        durationInFrames={entry.meta.durationInFrames}
        defaultProps={{} as never}
      />
    ))}
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
    </>
  );
};
