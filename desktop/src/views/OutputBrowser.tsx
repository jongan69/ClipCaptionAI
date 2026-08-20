import {useState} from 'react';
import GlassPanel from '../components/ui/GlassPanel';
import GlassButton from '../components/ui/GlassButton';
import GlassCard from '../components/ui/GlassCard';
import GlassTabs from '../components/ui/GlassTabs';

interface OutputEntry {
  name: string;
  path: string;
  type: string;
  date: string;
  size?: string;
}

// Placeholder data — will be replaced with IPC calls
const MOCK_OUTPUTS: OutputEntry[] = [];

export default function OutputBrowser() {
  const [filter, setFilter] = useState('all');

  const handleOpen = async (outputPath: string) => {
    try {
      await window.cca?.openPath(outputPath);
    } catch {
      /* cca not available */
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <GlassPanel variant="strong" size="lg" className="max-w-3xl mx-auto mt-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-text-main">Output Browser</h1>
            <p className="text-sm text-text-dim">
              Browse rendered videos, captions, and run artifacts.
            </p>
          </div>
          <GlassButton variant="primary" onClick={() => handleOpen('outputs')}>
            Open in Finder
          </GlassButton>
        </div>

        <GlassTabs
          tabs={[
            {id: 'all', label: 'All'},
            {id: 'captioned', label: 'Captioned'},
            {id: 'chapters', label: 'Chapters'},
            {id: 'tighten', label: 'Tightened'},
            {id: 'runs', label: 'Video Runs'},
          ]}
          activeTab={filter}
          onChange={setFilter}
          className="mb-4"
        />

        {MOCK_OUTPUTS.length === 0 ? (
          <GlassPanel className="p-8 text-center">
            <div className="text-4xl mb-3">📂</div>
            <p className="text-text-dim text-sm">No outputs yet.</p>
            <p className="text-text-muted text-xs mt-1">
              Run a transcription, caption, or enhancement workflow to see results here.
            </p>
          </GlassPanel>
        ) : (
          <div className="space-y-2">
            {MOCK_OUTPUTS.map((entry, i) => (
              <GlassCard key={i} hover className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-main">{entry.name}</div>
                  <div className="text-xs text-text-dim">
                    {entry.date} · {entry.size}
                  </div>
                </div>
                <GlassButton size="sm" onClick={() => handleOpen(entry.path)}>
                  Open
                </GlassButton>
              </GlassCard>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
