import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import GlassPanel from '../components/ui/GlassPanel';
import GlassCard from '../components/ui/GlassCard';
import GlassButton from '../components/ui/GlassButton';
import {useWorkflows} from '../hooks/useIpc';
import {useWorkflowStore} from '../stores/workflowStore';
import {useJobStore} from '../stores/jobStore';

const QUICK_ACTIONS = [
  {path: '/transcribe', label: 'Transcribe Video', icon: '🎙️', desc: 'Convert speech to captions'},
  {path: '/caption', label: 'Caption Video', icon: '✏️', desc: 'Add styled captions to video'},
  {
    path: '/workflow/auto-clips',
    label: 'Smart Clips',
    icon: '🧠',
    desc: 'AI-powered clip selection',
  },
  {
    path: '/workflow/enhance',
    label: 'Enhance with B-roll',
    icon: '🎬',
    desc: 'Add contextual cutaways',
  },
  {
    path: '/workflow/compress',
    label: 'Compress Video',
    icon: '📦',
    desc: 'CRF encoding & optimization',
  },
  {
    path: '/workflow/tighten',
    label: 'Tighten Video',
    icon: '✂️',
    desc: 'Remove filler & repetition',
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  useWorkflows(); // side-effect: loads workflows into the store
  const workflows = useWorkflowStore((s) => s.workflows);
  const env = useWorkflowStore((s) => s.environment);
  const currentJob = useJobStore((s) => s.currentJob);
  const [recentOutputs, setRecentOutputs] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const outputs = await window.cca?.listOutputs();
        if (outputs) setRecentOutputs(outputs.slice(0, 5));
      } catch {
        /* CCA not available outside Electron */
      }
    })();
  }, []);

  const envOk = env?.passed !== false;

  return (
    <div className="flex-1 overflow-y-auto space-y-4">
      {/* Hero */}
      <GlassPanel variant="strong" size="lg" className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-accent-cyan to-accent-blue bg-clip-text text-transparent">
              ClipCaptionAI Desktop
            </h1>
            <p className="text-text-dim mt-1 text-sm">
              AI-powered video editing — transcribe, caption, enhance, and render.
            </p>
            {!envOk && (
              <p className="text-accent-rose text-xs mt-2">
                ⚠️ Environment check failed — some features may be unavailable.
              </p>
            )}
          </div>
          <GlassButton variant="primary" size="lg" onClick={() => navigate('/transcribe')}>
            New Project
          </GlassButton>
        </div>
      </GlassPanel>

      {/* Quick Actions Grid */}
      <div>
        <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <GlassCard
              key={action.path}
              hover
              onClick={() => navigate(action.path)}
              className="flex items-start gap-3"
            >
              <span className="text-2xl">{action.icon}</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text-main">{action.label}</div>
                <div className="text-xs text-text-dim mt-0.5">{action.desc}</div>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>

      {/* Available Workflows */}
      {workflows.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider mb-3">
            All Workflows
          </h2>
          <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
            {workflows.slice(0, 16).map((w) => (
              <GlassCard
                key={w.id}
                hover
                onClick={() => navigate(`/workflow/${w.id}`)}
                className="text-center py-3"
              >
                <div className="text-xs font-medium text-text-main truncate">{w.title}</div>
                <div className="text-[10px] text-text-muted truncate mt-0.5">{w.command}</div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Recent Outputs */}
      <div>
        <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider mb-3">
          Recent Outputs
        </h2>
        {recentOutputs.length === 0 ? (
          <GlassPanel className="p-4 text-center text-text-muted text-sm">
            No recent outputs. Run a workflow to see results here.
          </GlassPanel>
        ) : (
          <div className="space-y-1">
            {recentOutputs.map((entry: any, i: number) => (
              <GlassCard key={i} hover className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-text-main">{entry.name}</div>
                  <div className="text-xs text-text-dim">
                    {new Date(entry.date).toLocaleString()}
                  </div>
                </div>
                <GlassButton
                  size="sm"
                  onClick={async () => {
                    await window.cca?.openPath(entry.path);
                  }}
                >
                  Open
                </GlassButton>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Active Job */}
      {currentJob?.status === 'running' && (
        <GlassPanel variant="strong" className="p-4 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" />
          <div className="flex-1">
            <div className="text-sm font-medium text-text-main">
              {currentJob.workflowTitle || 'Running workflow...'}
            </div>
            <div className="text-xs text-text-dim">
              {currentJob.stage || 'Processing'}
              {currentJob.percent !== undefined && ` · ${Math.round(currentJob.percent)}%`}
            </div>
          </div>
          <GlassButton size="sm" onClick={() => navigate(`/run/${currentJob.sessionId}`)}>
            View
          </GlassButton>
        </GlassPanel>
      )}
    </div>
  );
}
