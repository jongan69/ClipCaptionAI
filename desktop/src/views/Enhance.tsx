import { useState } from "react";
import GlassPanel from "../components/ui/GlassPanel";
import GlassInput from "../components/ui/GlassInput";
import GlassButton from "../components/ui/GlassButton";
import GlassProgress from "../components/ui/GlassProgress";
import { useRunWorkflow, useFilePicker } from "../hooks/useIpc";
import { useJobStore } from "../stores/jobStore";

export default function Enhance() {
  const [videoPath, setVideoPath] = useState("");
  const { run, stop, running } = useRunWorkflow();
  const { pickFile } = useFilePicker();
  const currentJob = useJobStore((s) => s.currentJob);

  return (
    <div className="flex-1 overflow-y-auto">
      <GlassPanel variant="strong" size="lg" className="max-w-2xl mx-auto mt-4">
        <h1 className="text-xl font-bold text-text-main mb-1">🎬 Enhance with B-roll</h1>
        <p className="text-sm text-text-dim mb-6">Add contextual cutaways, scene inserts, and captions to an existing video edit.</p>
        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <GlassInput label="Video File" placeholder="/path/to/video.mp4" value={videoPath} onChange={(e) => setVideoPath(e.target.value)} className="flex-1" />
            <GlassButton size="md" onClick={async () => { const p = await pickFile({title:"Select video"}); if(p) setVideoPath(p); }}>Browse</GlassButton>
          </div>
          {running && <GlassProgress value={currentJob?.percent ?? 0} indeterminate label={currentJob?.stage || "Enhancing..."} />}
          <div className="flex gap-3 pt-2">
            <GlassButton variant="primary" disabled={!videoPath || running} loading={running} onClick={() => run("enhance", "Enhance with B-roll", { video: videoPath })}>
              {running ? "Enhancing..." : "Enhance Video"}
            </GlassButton>
            {running && <GlassButton variant="danger" onClick={stop}>Cancel</GlassButton>}
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
