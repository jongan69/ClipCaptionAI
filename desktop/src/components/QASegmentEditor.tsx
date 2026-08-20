import GlassCard from './ui/GlassCard';

interface QAPair {
  index: number;
  question: string;
  answer: string;
  speakerQ: string;
  speakerA: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  included: boolean;
}

interface QASegmentEditorProps {
  segment: QAPair;
  onToggle: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function QASegmentEditor({segment, onToggle}: QASegmentEditorProps) {
  return (
    <GlassCard
      hover
      active={segment.included}
      onClick={onToggle}
      className="flex gap-3 cursor-pointer"
    >
      {/* Checkbox */}
      <div className="flex-shrink-0 pt-1">
        <div
          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
            ${
              segment.included
                ? 'bg-accent-cyan border-accent-cyan text-surface-dark'
                : 'border-glass-border-strong'
            }`}
        >
          {segment.included && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-bold text-accent-cyan bg-accent-cyan/10 px-2 py-0.5 rounded-md">
            #{segment.index}
          </span>
          <span className="text-xs text-text-muted">
            {formatTime(segment.startSeconds)} – {formatTime(segment.endSeconds)}
          </span>
          <span className="text-xs text-text-muted">·</span>
          <span className="text-xs text-text-muted">{Math.floor(segment.durationSeconds)}s</span>
        </div>

        {/* Question */}
        <div className="mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-blue">
            {segment.speakerQ}
          </span>
          <p className="text-sm text-text-main leading-relaxed mt-0.5">❓ {segment.question}</p>
        </div>

        {/* Answer */}
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-purple">
            {segment.speakerA}
          </span>
          <p className="text-xs text-text-dim leading-relaxed mt-0.5 line-clamp-2">
            💬 {segment.answer}
          </p>
        </div>
      </div>

      {/* Duration badge */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center">
        <div className="text-xs font-mono text-text-muted bg-glass-bg-strong px-2 py-1 rounded-md">
          {Math.floor(segment.durationSeconds)}s
        </div>
      </div>
    </GlassCard>
  );
}
