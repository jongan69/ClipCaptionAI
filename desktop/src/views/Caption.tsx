import {useState} from 'react';
import GlassPanel from '../components/ui/GlassPanel';
import GlassInput from '../components/ui/GlassInput';
import GlassButton from '../components/ui/GlassButton';
import GlassSelect from '../components/ui/GlassSelect';
import GlassProgress from '../components/ui/GlassProgress';
import {useRunWorkflow, useFilePicker} from '../hooks/useIpc';
import {useJobStore} from '../stores/jobStore';

export default function Caption() {
  const [videoPath, setVideoPath] = useState('');
  const [captionsPath, setCaptionsPath] = useState('');
  const [position, setPosition] = useState('left-impact');
  const [stylePreset, setStylePreset] = useState('default');
  const {run, stop, running} = useRunWorkflow();
  const {pickFile} = useFilePicker();
  const currentJob = useJobStore((s) => s.currentJob);

  const handlePickVideo = async () => {
    const path = await pickFile({title: 'Select video'});
    if (path) setVideoPath(path);
  };

  const handleCaption = () => {
    if (!videoPath) return;
    run('caption', 'Caption Video', {
      video: videoPath,
      ...(captionsPath && {captions: captionsPath}),
      position,
      ...(stylePreset !== 'default' && {'style-config': `styles/${stylePreset}.json`}),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <GlassPanel variant="strong" size="lg" className="max-w-2xl mx-auto mt-4">
        <h1 className="text-xl font-bold text-text-main mb-1">✏️ Caption Video</h1>
        <p className="text-sm text-text-dim mb-6">
          Add styled captions to your video with custom fonts, colors, and motion effects.
        </p>

        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <GlassInput
              label="Video File"
              placeholder="/path/to/video.mp4"
              value={videoPath}
              onChange={(e) => setVideoPath(e.target.value)}
              className="flex-1"
            />
            <GlassButton onClick={handlePickVideo} size="md">
              Browse
            </GlassButton>
          </div>

          <GlassInput
            label="Captions JSON (optional — auto-transcribes if empty)"
            placeholder="/path/to/captions.json"
            value={captionsPath}
            onChange={(e) => setCaptionsPath(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <GlassSelect
              label="Caption Position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              options={[
                {value: 'left-impact', label: 'Left Impact'},
                {value: 'right-hook', label: 'Right Hook'},
                {value: 'center-bottom', label: 'Center Bottom'},
                {value: 'center-impact', label: 'Center Impact'},
                {value: 'lower-left', label: 'Lower Left'},
              ]}
            />
            <GlassSelect
              label="Style Preset"
              value={stylePreset}
              onChange={(e) => setStylePreset(e.target.value)}
              options={[
                {value: 'default', label: 'Default'},
                {value: 'invert-mask-soft', label: 'Invert Mask (Soft)'},
                {value: 'invert-mask-bold', label: 'Invert Mask (Bold)'},
                {value: 'clean-editorial', label: 'Clean Editorial'},
                {value: 'broll-heavy-custom-scenes', label: 'B-Roll Heavy'},
              ]}
            />
          </div>

          {running && (
            <GlassProgress
              value={currentJob?.percent ?? 0}
              indeterminate={!currentJob?.percent}
              label={currentJob?.stage || 'Rendering...'}
            />
          )}

          <div className="flex gap-3 pt-2">
            <GlassButton
              variant="primary"
              disabled={!videoPath || running}
              loading={running}
              onClick={handleCaption}
            >
              {running ? 'Rendering...' : 'Caption & Render'}
            </GlassButton>
            {running && (
              <GlassButton variant="danger" onClick={stop}>
                Cancel
              </GlassButton>
            )}
          </div>

          {currentJob?.status === 'completed' && (
            <div className="p-3 glass-sm bg-accent-green/10 border border-accent-green/30 rounded-xl text-sm text-accent-green">
              ✅ Render complete! Check the Outputs tab.
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
