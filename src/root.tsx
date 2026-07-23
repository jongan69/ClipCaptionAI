import {Composition} from 'remotion';
import {CaptionedClip, captionedClipDefaultProps} from './captioned-clip';
import type {CaptionedClipProps} from './types';
import {compositionMatrix} from './logo/registry';
import {LogoStage} from './logo/logo-stage';
import {PromptVideo, promptVideoDefaultProps, type PromptVideoProps} from './prompt-video';
import {
  ListingOSScaleScene,
  ListingOSOutroScene,
  ListingOSEvidenceGateScene,
  ListingOSPipelineScene,
  ListingOSProblemGapScene,
} from './listingos-deck-scenes';

type LogoCompositionProps = {
  background?: string;
};

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
            const Stage = (props: LogoCompositionProps) => (
              <LogoStage
                logo={entry.logo}
                variant={entry.component}
                background={props.background}
              />
            );
            return Stage;
          })() as unknown) as typeof LogoStage
        }
        fps={30}
        width={1080}
        height={1080}
        durationInFrames={entry.meta.durationInFrames}
        defaultProps={{
          background: entry.logo.brand.palette.background ?? '#000',
        } as never}
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
    <Composition
      id="listingos-problem-gap"
      component={ListingOSProblemGapScene}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={240}
    />
    <Composition
      id="listingos-pipeline"
      component={ListingOSPipelineScene}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={240}
    />
    <Composition
      id="listingos-evidence-gate"
      component={ListingOSEvidenceGateScene}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={240}
    />
    <Composition
      id="listingos-scale"
      component={ListingOSScaleScene}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={210}
    />
    <Composition
      id="listingos-outro"
      component={ListingOSOutroScene}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={210}
    />
    </>
  );
};
