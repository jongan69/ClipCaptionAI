import {useState} from 'react';
import {useJobStore} from '../stores/jobStore';
import {requestWorkflowStop} from '../lib/stopWorkflow';

export default function StatusBar() {
  const currentJob = useJobStore((s) => s.currentJob);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState('');

  if (!currentJob) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-9 glass border-0 border-t border-glass-border rounded-none
      flex items-center px-4 gap-3 z-50"
    >
      {/* Status indicator */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          currentJob.status === 'running'
            ? 'bg-accent-cyan animate-pulse'
            : currentJob.status === 'error'
              ? 'bg-accent-rose'
              : 'bg-accent-green'
        }`}
      />

      {/* Job info */}
      <span className="text-xs text-text-dim font-medium truncate">
        {currentJob.workflowTitle || currentJob.sessionId}
      </span>

      {/* Progress bar */}
      {currentJob.percent !== undefined && (
        <div className="flex-1 max-w-[200px]">
          <div className="h-1.5 bg-glass-bg-strong rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-cyan to-accent-blue rounded-full transition-all duration-300"
              style={{width: `${Math.min(100, currentJob.percent)}%`}}
            />
          </div>
        </div>
      )}

      <span className="text-xs text-text-muted">
        {currentJob.percent !== undefined ? `${Math.round(currentJob.percent)}%` : ''}
      </span>

      {/* Stage */}
      {currentJob.stage && <span className="text-xs text-text-dim">{currentJob.stage}</span>}

      {/* Elapsed */}
      {currentJob.startedAt && (
        <span className="text-xs text-text-muted ml-auto">
          {formatElapsed(currentJob.startedAt)}
        </span>
      )}

      {/* Cancel button */}
      {currentJob.status === 'running' && (
        <button
          disabled={stopping}
          onClick={async () => {
            setStopping(true);
            setStopError('');
            try {
              await requestWorkflowStop(currentJob.sessionId, window.cca?.stopWorkflow);
            } catch (error) {
              setStopError(
                error instanceof Error ? error.message : 'Unable to cancel the workflow.',
              );
            } finally {
              setStopping(false);
            }
          }}
          className="text-xs text-accent-rose hover:text-red-300 transition-colors"
        >
          {stopping ? 'Cancelling…' : 'Cancel'}
        </button>
      )}
      {stopError && (
        <span role="alert" className="text-xs text-accent-rose">
          {stopError}
        </span>
      )}
    </div>
  );
}

function formatElapsed(startedAt: string): string {
  const elapsed = Date.now() - new Date(startedAt).getTime();
  const seconds = Math.floor(elapsed / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
