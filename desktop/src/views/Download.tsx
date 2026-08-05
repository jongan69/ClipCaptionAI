import { useState, useEffect } from "react";
import GlassPanel from "../components/ui/GlassPanel";
import GlassButton from "../components/ui/GlassButton";
import GlassProgress from "../components/ui/GlassProgress";
import { useRunWorkflow } from "../hooks/useIpc";
import { useJobStore } from "../stores/jobStore";

export default function Download() {
  const [links, setLinks] = useState("");
  const { run, stop, running } = useRunWorkflow();
  const currentJob = useJobStore((s) => s.currentJob);

  useEffect(() => {
    (async () => {
      try {
        const content = await (window as any).cca?.readProjectFile("links.txt");
        if (content) setLinks(content);
      } catch {}
    })();
  }, []);

  const saveLinks = async () => {
    try {
      await (window as any).cca?.writeProjectFile("links.txt", links);
    } catch {}
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <GlassPanel variant="strong" size="lg" className="max-w-2xl mx-auto mt-4">
        <h1 className="text-xl font-bold text-text-main mb-1">⬇️ YouTube Download</h1>
        <p className="text-sm text-text-dim mb-6">Paste YouTube URLs (one per line) to download videos.</p>
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-dim font-medium">YouTube URLs</label>
            <textarea
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              placeholder={"https://youtube.com/watch?v=...\nhttps://youtube.com/shorts/..."}
              className="w-full border border-glass-border bg-glass-bg-strong text-text-main rounded-[10px] px-3 py-2 text-sm h-40 placeholder:text-text-muted focus:outline-none focus:border-glass-border-focus resize-y"
            />
          </div>
          {running && <GlassProgress value={currentJob?.percent ?? 0} indeterminate label={currentJob?.stage || "Downloading..."} />}
          <div className="flex gap-3 pt-2">
            <GlassButton variant="primary" disabled={!links.trim() || running} loading={running} onClick={() => { saveLinks(); run("download", "Download Videos", { links: "links.txt" }); }}>
              {running ? "Downloading..." : "Download"}
            </GlassButton>
            {running && <GlassButton variant="danger" onClick={stop}>Cancel</GlassButton>}
            <GlassButton onClick={saveLinks}>Save Links</GlassButton>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
