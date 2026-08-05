import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from "react";

interface DragDropZoneProps {
  onVideoSelected: (filePath: string, fileName: string, fileSize: number) => void;
  disabled?: boolean;
  acceptedFile?: { name: string; path: string; size: number } | null;
}

export default function DragDropZone({ onVideoSelected, disabled, acceptedFile }: DragDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"];

  const isValidVideo = (name: string) =>
    VIDEO_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!isValidVideo(file.name)) {
        setError(`Unsupported format. Use: ${VIDEO_EXTENSIONS.join(", ")}`);
        return;
      }
      // Get the real filesystem path via Electron's File.path
      const filePath = (file as any).path;
      if (filePath) {
        onVideoSelected(filePath, file.name, file.size);
      } else {
        setError("Could not resolve file path. Try browsing instead.");
      }
    },
    [onVideoSelected]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const videoFile = files.find((f) => isValidVideo(f.name));
      if (videoFile) {
        await processFile(videoFile);
      } else {
        setError("No video file found. Drop an MP4, MOV, or similar.");
      }
    },
    [disabled, processFile]
  );

  const handleBrowse = useCallback(async () => {
    try {
      const path = await (window as any).cca?.pickPath({
        title: "Select interview video",
        filters: [{ name: "Videos", extensions: ["mp4", "mov", "m4v", "webm", "mkv"] }],
      });
      if (path?.filePaths?.[0]) {
        const fullPath = path.filePaths[0];
        const name = fullPath.split("/").pop() || fullPath;
        onVideoSelected(fullPath, name, 0);
      }
    } catch {
      // Fallback to native input
      inputRef.current?.click();
    }
  }, [onVideoSelected]);

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "";
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1e3).toFixed(0)} KB`;
  };

  // If a file is already accepted, show it
  if (acceptedFile) {
    return (
      <div className={`glass-lg p-6 text-center border-2 border-accent-green/40 bg-accent-green/5 transition-all duration-300`}>
        <div className="text-3xl mb-2">✅</div>
        <div className="text-sm font-semibold text-text-main truncate">{acceptedFile.name}</div>
        <div className="text-xs text-text-dim mt-1">
          {acceptedFile.path}
          {acceptedFile.size > 0 && ` · ${formatSize(acceptedFile.size)}`}
        </div>
        {!disabled && (
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-3 text-xs text-accent-cyan hover:text-accent-blue transition-colors"
          >
            Choose different video
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`glass-lg p-8 text-center border-2 border-dashed cursor-pointer transition-all duration-300
        ${isDragOver
          ? "border-accent-cyan bg-accent-cyan/10 scale-[1.02]"
          : "border-glass-border-strong hover:border-accent-blue/40 hover:bg-glass-bg-hover"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={async (e: ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          if (file) await processFile(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />

      <div className="text-5xl mb-3">🎬</div>
      <div className="text-base font-semibold text-text-main mb-1">
        {isDragOver ? "✨ Drop it!" : "Drag & Drop Interview Video"}
      </div>
      <div className="text-sm text-text-dim">
        {isDragOver ? "Release to analyze" : "or click to browse"}
      </div>
      <div className="text-xs text-text-muted mt-2">
        MP4, MOV, M4V, WebM — 2-person interview format
      </div>
      {error && (
        <div className="mt-3 p-2 glass-sm bg-accent-rose/10 border border-accent-rose/30 text-xs text-accent-rose">
          {error}
        </div>
      )}
    </div>
  );
}
