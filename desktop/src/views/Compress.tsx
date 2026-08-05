import { useState } from "react";
import GlassPanel from "../components/ui/GlassPanel";
import GlassInput from "../components/ui/GlassInput";
import GlassButton from "../components/ui/GlassButton";
import GlassSelect from "../components/ui/GlassSelect";
import GlassProgress from "../components/ui/GlassProgress";
import { useRunWorkflow, useFilePicker } from "../hooks/useIpc";
import { useJobStore } from "../stores/jobStore";

export default function Compress() {
  const [videoPath, setVideoPath] = useState("");
  const [quality, setQuality] = useState("high");
  const [codec, setCodec] = useState("h264");
  const [scale, setScale] = useState("");
  const { run, stop, running } = useRunWorkflow();
  const { pickFile } = useFilePicker();
  const currentJob = useJobStore((s) => s.currentJob);

  return (
    <div className="flex-1 overflow-y-auto">
      <GlassPanel variant="strong" size="lg" className="max-w-2xl mx-auto mt-4">
        <h1 className="text-xl font-bold text-text-main mb-1">📦 Compress Video</h1>
        <p className="text-sm text-text-dim mb-6">CRF encoding with quality presets. Optimize video size without visible quality loss.</p>
        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <GlassInput label="Video File" placeholder="/path/to/video.mp4" value={videoPath} onChange={(e) => setVideoPath(e.target.value)} className="flex-1" />
            <GlassButton size="md" onClick={async () => { const p = await pickFile({title:"Select video"}); if(p) setVideoPath(p); }}>Browse</GlassButton>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <GlassSelect label="Quality" value={quality} onChange={(e) => setQuality(e.target.value)} options={[
              { value: "lossless", label: "Lossless (CRF 17)" },
              { value: "high", label: "High (CRF 20)" },
              { value: "medium", label: "Medium (CRF 23)" },
              { value: "aggressive", label: "Aggressive (CRF 28)" },
            ]} />
            <GlassSelect label="Codec" value={codec} onChange={(e) => setCodec(e.target.value)} options={[
              { value: "h264", label: "H.264" }, { value: "h265", label: "H.265 (HEVC)" },
            ]} />
          </div>
          <GlassInput label="Scale (optional)" placeholder="1280:720 or 1920:1080" value={scale} onChange={(e) => setScale(e.target.value)} />
          {running && <GlassProgress value={currentJob?.percent ?? 0} indeterminate={!currentJob?.percent} label={currentJob?.stage || "Encoding..."} />}
          <div className="flex gap-3 pt-2">
            <GlassButton variant="primary" disabled={!videoPath || running} loading={running} onClick={() => run("compress", "Compress Video", { video: videoPath, quality, codec, ...(scale && { scale }) })}>
              {running ? "Compressing..." : "Compress"}
            </GlassButton>
            {running && <GlassButton variant="danger" onClick={stop}>Cancel</GlassButton>}
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
