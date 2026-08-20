import {useParams} from 'react-router-dom';
import GlassPanel from '../components/ui/GlassPanel';
import GlassButton from '../components/ui/GlassButton';
import GlassProgress from '../components/ui/GlassProgress';
import {useJobStore} from '../stores/jobStore';

export default function RunMonitor() {
  const {session} = useParams<{session: string}>();
  const currentJob = useJobStore((s) => s.currentJob);
  const isActive = currentJob?.sessionId === session && currentJob?.status === 'running';

  // Fallback: no matching job
  if (!currentJob || currentJob.sessionId !== session) {
    return (
      <div className="flex-1 overflow-y-auto">
        <GlassPanel variant="strong" size="lg" className="max-w-2xl mx-auto mt-4 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h1 className="text-lg font-bold text-text-main">Run Not Found</h1>
          <p className="text-sm text-text-dim mt-1">
            Session <code className="text-accent-cyan">{session}</code> is not active.
          </p>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <GlassPanel variant="strong" size="lg" className="max-w-3xl mx-auto mt-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-text-main">
              {currentJob.workflowTitle || 'Running Workflow'}
            </h1>
            <p className="text-xs text-text-muted font-mono mt-0.5">{session}</p>
          </div>
          {isActive && (
            <GlassButton variant="danger" size="sm">
              Cancel
            </GlassButton>
          )}
        </div>

        {/* Progress */}
        <GlassProgress
          value={currentJob.percent ?? 0}
          indeterminate={currentJob.percent === undefined && isActive}
          variant={
            currentJob.status === 'error'
              ? 'danger'
              : currentJob.status === 'completed'
                ? 'success'
                : 'accent'
          }
          label={currentJob.stage || (isActive ? 'Running...' : currentJob.status)}
          className="mb-4"
        />

        {/* Log Viewer */}
        <div className="glass-sm bg-surface-darkest border border-glass-border p-3 h-80 overflow-y-auto font-mono text-xs">
          <div className="text-text-muted mb-2">
            {currentJob.logs.length === 0
              ? 'Waiting for output...'
              : `Session started at ${currentJob.startedAt}`}
          </div>
          {currentJob.logs.map((entry, i) => (
            <div
              key={i}
              className={`leading-relaxed whitespace-pre-wrap break-all ${
                entry.channel === 'stderr' ? 'text-accent-rose' : 'text-text-dim'
              }`}
            >
              {entry.text}
            </div>
          ))}
        </div>

        {/* Result */}
        {currentJob.status === 'completed' && (
          <div className="mt-4 p-3 glass-sm bg-accent-green/10 border border-accent-green/30 rounded-xl">
            <div className="text-sm font-semibold text-accent-green">Completed Successfully</div>
            <div className="text-xs text-text-dim mt-1">
              Exit code: {currentJob.exitCode}
              {currentJob.endedAt && ` · Ended at ${currentJob.endedAt}`}
            </div>
          </div>
        )}

        {currentJob.status === 'error' && (
          <div className="mt-4 p-3 glass-sm bg-accent-rose/10 border border-accent-rose/30 rounded-xl">
            <div className="text-sm font-semibold text-accent-rose">Failed</div>
            <div className="text-xs text-text-dim mt-1">
              {currentJob.error || `Exit code: ${currentJob.exitCode}`}
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
