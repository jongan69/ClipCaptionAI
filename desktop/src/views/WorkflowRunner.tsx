import {useState} from 'react';
import {useParams} from 'react-router-dom';
import GlassPanel from '../components/ui/GlassPanel';
import GlassInput from '../components/ui/GlassInput';
import GlassButton from '../components/ui/GlassButton';
import GlassSelect from '../components/ui/GlassSelect';
import GlassProgress from '../components/ui/GlassProgress';
import {useRunWorkflow, useFilePicker} from '../hooks/useIpc';
import {useWorkflowStore, type WorkflowArg} from '../stores/workflowStore';
import {useJobStore} from '../stores/jobStore';

export default function WorkflowRunner() {
  const {id} = useParams<{id: string}>();
  const workflows = useWorkflowStore((s) => s.workflows);
  const workflow = workflows.find((w) => w.id === id);
  const title =
    workflow?.title ||
    id
      ?.split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') ||
    'Workflow';
  const {run, stop, running} = useRunWorkflow();
  const {pickFile} = useFilePicker();
  const currentJob = useJobStore((s) => s.currentJob);
  const [formValues, setFormValues] = useState<Record<string, any>>({});

  const setValue = (name: string, value: any) => {
    setFormValues((prev) => ({...prev, [name]: value}));
  };

  const handleRun = () => {
    if (!id) return;
    run(id, title, formValues);
  };

  const renderField = (arg: WorkflowArg) => {
    if (arg.type === 'boolean') {
      return (
        <label key={arg.name} className="flex items-center gap-2 cursor-pointer py-1">
          <input
            type="checkbox"
            checked={!!formValues[arg.name]}
            onChange={(e) => setValue(arg.name, e.target.checked)}
            className="rounded accent-accent-cyan"
          />
          <span className="text-sm text-text-main">{arg.label}</span>
        </label>
      );
    }

    if (arg.type === 'select' && arg.options) {
      return (
        <GlassSelect
          key={arg.name}
          label={arg.label}
          value={formValues[arg.name] || arg.value || ''}
          onChange={(e) => setValue(arg.name, e.target.value)}
          options={arg.options}
        />
      );
    }

    if (arg.type === 'path') {
      return (
        <div key={arg.name} className="flex gap-2 items-end">
          <GlassInput
            label={arg.label}
            placeholder={arg.placeholder}
            value={formValues[arg.name] || ''}
            onChange={(e) => setValue(arg.name, e.target.value)}
            className="flex-1"
          />
          <GlassButton
            size="md"
            onClick={async () => {
              const p = await pickFile({title: `Select ${arg.label}`});
              if (p) setValue(arg.name, p);
            }}
          >
            Browse
          </GlassButton>
        </div>
      );
    }

    if (arg.type === 'textarea') {
      return (
        <div key={arg.name} className="flex flex-col gap-1.5">
          <label className="text-xs text-text-dim font-medium">
            {arg.label}
            {arg.required ? ' *' : ''}
          </label>
          <textarea
            placeholder={arg.placeholder}
            value={formValues[arg.name] || ''}
            onChange={(e) => setValue(arg.name, e.target.value)}
            className="w-full border border-glass-border bg-glass-bg-strong text-text-main rounded-[10px] px-3 py-2 text-sm placeholder:text-text-muted focus:outline-none focus:border-glass-border-focus min-h-[80px] resize-y"
          />
        </div>
      );
    }

    return (
      <GlassInput
        key={arg.name}
        label={arg.label}
        type={arg.type === 'number' ? 'number' : 'text'}
        placeholder={arg.placeholder}
        value={formValues[arg.name] ?? ''}
        onChange={(e) =>
          setValue(arg.name, arg.type === 'number' ? Number(e.target.value) : e.target.value)
        }
      />
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <GlassPanel variant="strong" size="lg" className="max-w-2xl mx-auto mt-4">
        <h1 className="text-xl font-bold text-text-main mb-1">{title}</h1>
        <p className="text-sm text-text-dim mb-1">
          {workflow?.description || 'Configure and run this workflow.'}
        </p>
        <p className="text-xs text-text-muted font-mono mb-6">
          clipcaptionai {workflow?.command || id}
        </p>

        {workflow?.args && workflow.args.length > 0 ? (
          <div className="space-y-4 mb-6">{workflow.args.map(renderField)}</div>
        ) : (
          <GlassPanel className="p-4 text-center text-text-muted text-sm mb-6">
            No configuration needed. Ready to run.
          </GlassPanel>
        )}

        {running && (
          <GlassProgress
            value={currentJob?.percent ?? 0}
            indeterminate={currentJob?.percent === undefined}
            label={currentJob?.stage || 'Running...'}
            className="mb-4"
          />
        )}

        <div className="flex gap-3">
          <GlassButton variant="primary" onClick={handleRun} loading={running} disabled={running}>
            {running ? 'Running...' : `Run ${title}`}
          </GlassButton>
          {running && (
            <GlassButton variant="danger" onClick={stop}>
              Cancel
            </GlassButton>
          )}
        </div>

        {currentJob?.status === 'completed' && (
          <div className="mt-4 p-3 glass-sm bg-accent-green/10 border border-accent-green/30 rounded-xl text-sm text-accent-green">
            ✅ Completed successfully.
          </div>
        )}
        {currentJob?.status === 'error' && (
          <div className="mt-4 p-3 glass-sm bg-accent-rose/10 border border-accent-rose/30 rounded-xl text-sm text-accent-rose">
            ❌ {currentJob.error || `Failed with exit code ${currentJob.exitCode}`}
          </div>
        )}

        {/* Log tail */}
        {currentJob && currentJob.logs.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-text-dim font-semibold mb-1">Recent Output</div>
            <div className="glass-sm bg-surface-darkest border border-glass-border p-3 max-h-40 overflow-y-auto font-mono text-xs text-text-dim">
              {currentJob.logs.slice(-20).map((entry, i) => (
                <div key={i} className={entry.channel === 'stderr' ? 'text-accent-rose' : ''}>
                  {entry.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
