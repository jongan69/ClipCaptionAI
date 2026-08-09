import {Composition} from 'remotion';
import {Root} from './root';
import {compositionMatrix} from './logo/registry';
import {LogoStage} from './logo/logo-stage';
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

export const ShowcaseRoot = () => (
  <>
    <Root />
    {compositionMatrix().map((entry) => (
      <Composition
        key={entry.id}
        id={entry.id}
        component={
          ((() => {
            const Stage = (props: LogoCompositionProps) => (
              <LogoStage logo={entry.logo} variant={entry.component} background={props.background} />
            );
            return Stage;
          })() as unknown) as typeof LogoStage
        }
        fps={30}
        width={1080}
        height={1080}
        durationInFrames={entry.meta.durationInFrames}
        defaultProps={{background: entry.logo.brand.palette.background ?? '#000'} as never}
      />
    ))}
    <Composition id="listingos-problem-gap" component={ListingOSProblemGapScene} fps={30} width={1920} height={1080} durationInFrames={240} />
    <Composition id="listingos-pipeline" component={ListingOSPipelineScene} fps={30} width={1920} height={1080} durationInFrames={240} />
    <Composition id="listingos-evidence-gate" component={ListingOSEvidenceGateScene} fps={30} width={1920} height={1080} durationInFrames={240} />
    <Composition id="listingos-scale" component={ListingOSScaleScene} fps={30} width={1920} height={1080} durationInFrames={210} />
    <Composition id="listingos-outro" component={ListingOSOutroScene} fps={30} width={1920} height={1080} durationInFrames={210} />
  </>
);
