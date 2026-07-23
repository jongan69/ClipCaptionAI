import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
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
  audio?: string | null;
};

export const promptVideoDefaultProps: PromptVideoProps = {
  width: 1920,
  height: 1080,
  fps: 30,
  shots: [{id: 'shot-01', prompt: 'ClipCaptionAI', durationSeconds: 4, asset: null}],
  audio: null,
};

const isVideo = (asset: string) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(asset);

export const PromptVideo = ({shots, audio}: PromptVideoProps) => {
  const {fps, width, height} = useVideoConfig();
  const audioSource = audio && !/^https?:\/\//.test(audio) ? staticFile(audio) : audio;
  let startFrame = 0;
  return (
    <AbsoluteFill style={{backgroundColor: '#101114', color: '#fff', fontFamily: 'Arial, sans-serif'}}>
      {audioSource ? <Audio src={audioSource} /> : null}
      {shots.map((shot) => {
        const from = startFrame;
        const durationInFrames = Math.max(1, Math.round(shot.durationSeconds * fps));
        startFrame += durationInFrames;
        return (
          <Sequence key={shot.id} from={from} durationInFrames={durationInFrames}>
            <ShotFrame shot={shot} index={shots.indexOf(shot)} width={width} height={height} durationInFrames={durationInFrames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const ShotFrame = ({shot, index, width, height, durationInFrames}: {shot: Shot; index: number; width: number; height: number; durationInFrames: number}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, durationInFrames], [1.04, 1], {extrapolateRight: 'clamp'});
  const assetSource = shot.asset && !/^https?:\/\//.test(shot.asset) ? staticFile(shot.asset) : shot.asset;
  const gradients = [
    'linear-gradient(135deg, #13233f 0%, #2367a8 48%, #e04f7d 100%)',
    'linear-gradient(135deg, #21134f 0%, #7a3db8 52%, #f08b4f 100%)',
    'linear-gradient(135deg, #062d35 0%, #087f82 52%, #d7a641 100%)',
  ];
  return (
    <AbsoluteFill style={{overflow: 'hidden', justifyContent: 'center', alignItems: 'center', background: gradients[index % gradients.length]}}>
      {assetSource ? (
        isVideo(assetSource) ? (
          <OffthreadVideo src={assetSource} style={{width, height, objectFit: 'cover', transform: `scale(${scale})`}} />
        ) : (
          <Img src={assetSource} style={{width, height, objectFit: 'cover', transform: `scale(${scale})`}} />
        )
      ) : null}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(4,8,18,.08), rgba(4,8,18,.5))'}} />
      <div style={{position: 'absolute', top: Math.round(height * 0.08), left: Math.round(width * 0.07), right: Math.round(width * 0.07), display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,.88)', fontSize: Math.max(22, Math.round(width * 0.025)), fontWeight: 800, letterSpacing: 3}}>
        <span>CLIPCAPTIONAI</span><span>VIDEO HARNESS</span>
      </div>
      <div style={{position: 'relative', padding: Math.round(width * 0.07), maxWidth: '90%', textAlign: 'center', fontSize: Math.max(48, Math.round(width * 0.07)), fontWeight: 850, lineHeight: 1.06, color: '#fff', textShadow: '0 4px 18px rgba(0,0,0,.5)'}}>
        {shot.prompt}
      </div>
      <div style={{position: 'absolute', bottom: Math.round(height * 0.08), left: Math.round(width * 0.07), right: Math.round(width * 0.07), height: 8, background: 'rgba(255,255,255,.32)', borderRadius: 8}}><div style={{height: '100%', width: `${Math.max(12, ((index + 1) / 6) * 100)}%`, background: '#fff', borderRadius: 8}} /></div>
    </AbsoluteFill>
  );
};
