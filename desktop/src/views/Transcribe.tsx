import { useState } from "react";
import GlassPanel from "../components/ui/GlassPanel";
import GlassInput from "../components/ui/GlassInput";
import GlassButton from "../components/ui/GlassButton";
import GlassProgress from "../components/ui/GlassProgress";
import GlassSelect from "../components/ui/GlassSelect";
import { useRunWorkflow, useFilePicker } from "../hooks/useIpc";
import { useJobStore } from "../stores/jobStore";

export default function Transcribe() {
  const [videoPath, setVideoPath] = useState("");
  const [provider, setProvider] = useState("auto");
  const [model, setModel] = useState("");
  const [language, setLanguage] = useState("en");
  const { run, stop, running } = useRunWorkflow();
  const { pickFile } = useFilePicker();
  const currentJob = useJobStore((s) => s.currentJob);

  const handlePickVideo = async () => {
    const path = await pickFile({ title: "Select video to transcribe" });
    if (path) setVideoPath(path);
  };

  const handleTranscribe = () => {
    if (!videoPath) return;
    run("transcribe", "Transcribe Video", {
      video: videoPath,
      provider,
      ...(model && { model }),
      language,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <GlassPanel variant="strong" size="lg" className="max-w-2xl mx-auto mt-4">
        <h1 className="text-xl font-bold text-text-main mb-1">🎙️ Transcribe Video</h1>
        <p className="text-sm text-text-dim mb-6">
          Convert speech to text using local whisper.cpp, OpenAI Whisper, or YouTube captions.
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
            <GlassButton onClick={handlePickVideo} size="md">Browse</GlassButton>
          </div>

          <GlassSelect
            label="Transcription Provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            options={[
              { value: "auto", label: "Auto (whisper.cpp → OpenAI → YouTube)" },
              { value: "local-whispercpp", label: "Local whisper.cpp" },
              { value: "openai", label: "OpenAI Whisper API" },
              { value: "youtube", label: "YouTube Captions (CC)" },
            ]}
          />

          <div className="grid grid-cols-2 gap-4">
            <GlassInput label="Model (optional)" placeholder="whisper-1 or small.en" value={model} onChange={(e) => setModel(e.target.value)} />
            <GlassInput label="Language" placeholder="en" value={language} onChange={(e) => setLanguage(e.target.value)} />
          </div>

          {running && (
            <GlassProgress
              value={currentJob?.percent ?? 0}
              indeterminate={currentJob?.percent === undefined}
              label={currentJob?.stage || "Transcribing..."}
            />
          )}

          <div className="flex gap-3 pt-2">
            <GlassButton variant="primary" disabled={!videoPath || running} loading={running} onClick={handleTranscribe}>
              {running ? "Transcribing..." : "Start Transcription"}
            </GlassButton>
            {running && <GlassButton variant="danger" onClick={stop}>Cancel</GlassButton>}
          </div>

          {currentJob?.status === "completed" && (
            <div className="p-3 glass-sm bg-accent-green/10 border border-accent-green/30 rounded-xl text-sm text-accent-green">
              ✅ Transcription complete! Output saved to outputs/ directory.
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
