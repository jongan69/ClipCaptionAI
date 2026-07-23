import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

type Shot = {
  id: string;
  prompt: string;
  durationSeconds: number;
  asset?: string | null;
};

export type PromptVideoProps = {
  width: number;
  height: number;
  fps: number;
  shots: Shot[];
};

export const promptVideoDefaultProps: PromptVideoProps = {
  width: 1920,
  height: 1080,
  fps: 30,
  shots: [{id: 'shot-01', prompt: 'ClipCaptionAI', durationSeconds: 4, asset: null}],
};

const isVideo = (asset: string) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(asset);

export const PromptVideo = ({shots}: PromptVideoProps) => {
  const {fps, width, height} = useVideoConfig();
  let startFrame = 0;
  return (
    <AbsoluteFill style={{backgroundColor: '#101114', color: '#fff', fontFamily: 'Arial, sans-serif'}}>
      {shots.map((shot) => {
        const from = startFrame;
        const durationInFrames = Math.max(1, Math.round(shot.durationSeconds * fps));
        startFrame += durationInFrames;
        return (
          <Sequence key={shot.id} from={from} durationInFrames={durationInFrames}>
            <ShotFrame shot={shot} width={width} height={height} durationInFrames={durationInFrames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const ShotFrame = ({shot, width, height, durationInFrames}: {shot: Shot; width: number; height: number; durationInFrames: number}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, durationInFrames], [1.04, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{overflow: 'hidden', justifyContent: 'flex-end'}}>
      {shot.asset ? (
        isVideo(shot.asset) ? (
          <OffthreadVideo src={shot.asset} style={{width, height, objectFit: 'cover', transform: `scale(${scale})`}} />
        ) : (
          <Img src={shot.asset} style={{width, height, objectFit: 'cover', transform: `scale(${scale})`}} />
        )
      ) : null}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,.78) 100%)'}} />
      <div style={{padding: Math.round(width * 0.06), paddingBottom: Math.round(height * 0.08), fontSize: Math.max(36, Math.round(width * 0.045)), fontWeight: 700, lineHeight: 1.1, textShadow: '0 3px 12px rgba(0,0,0,.7)'}}>
        {shot.prompt}
      </div>
    </AbsoluteFill>
  );
};
