import { useState } from "react";
import GlassPanel from "../components/ui/GlassPanel";
import GlassInput from "../components/ui/GlassInput";
import GlassButton from "../components/ui/GlassButton";
import GlassTabs from "../components/ui/GlassTabs";
import GlassSelect from "../components/ui/GlassSelect";
import { useSecrets, usePreferences, useEnvironment } from "../hooks/useIpc";
import { useSettingsStore } from "../stores/settingsStore";

type SettingsTab = "secrets" | "models" | "paths" | "cleanup" | "environment";

const SECRET_KEYS = [
  { key: "OPENAI_API_KEY", label: "OpenAI API Key", hasKey: "hasOpenAI" as const },
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek API Key", hasKey: "hasDeepSeek" as const },
  { key: "YOUTUBE_API_KEY", label: "YouTube Data API Key", hasKey: "hasYouTube" as const },
  { key: "FAL_KEY", label: "FAL Key (Image/Video)", hasKey: "hasFal" as const },
  { key: "ELEVENLABS_API_KEY", label: "ElevenLabs API Key", hasKey: "hasElevenLabs" as const },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("secrets");
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  const secrets = useSettingsStore((s) => s.secrets);
  const { saveSecret, clearSecret } = useSecrets();
  const env = useEnvironment();

  const handleSaveSecret = async (key: string) => {
    const value = secretValues[key];
    if (!value) return;
    setSavingKey(key);
    await saveSecret(key, value);
    setSecretValues((prev) => ({ ...prev, [key]: "" }));
    setSavingKey(null);
  };

  const handleClearSecret = async (key: string) => {
    setSavingKey(key);
    await clearSecret(key);
    setSavingKey(null);
  };

  const handleCleanup = async (scope: string) => {
    setCleanupResult(null);
    try {
      const result = await (window as any).cca?.cleanup(scope);
      setCleanupResult(result?.ok ? `Cleaned: ${result.cleaned?.join(", ") || "nothing"}` : `Error: ${result?.error}`);
    } catch (e: any) {
      setCleanupResult(`Error: ${e.message}`);
    }
  };

  const tabs = [
    { id: "secrets" as const, label: "🔑 API Keys" },
    { id: "models" as const, label: "🤖 Models" },
    { id: "paths" as const, label: "📁 Paths" },
    { id: "cleanup" as const, label: "🧹 Cleanup" },
    { id: "environment" as const, label: "⚙️ Environment" },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <GlassPanel variant="strong" size="lg" className="max-w-3xl mx-auto mt-4">
        <h1 className="text-xl font-bold text-text-main mb-1">Settings</h1>
        <p className="text-sm text-text-dim mb-6">
          Manage API keys, model preferences, and application configuration.
        </p>

        <GlassTabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id)} className="mb-6" />

        {/* Secrets Tab */}
        {activeTab === "secrets" && (
          <div className="space-y-4">
            <p className="text-xs text-text-muted">
              API keys are encrypted at rest and never exposed to the renderer.
            </p>
            {SECRET_KEYS.map(({ key, label, hasKey }) => (
              <div key={key} className="flex items-end gap-3">
                <GlassInput
                  label={label}
                  type="password"
                  placeholder={secrets[hasKey] ? "•••••••• (saved)" : "Enter key..."}
                  value={secretValues[key] || ""}
                  onChange={(e) => setSecretValues((p) => ({ ...p, [key]: e.target.value }))}
                  className="flex-1"
                />
                <GlassButton
                  size="md"
                  disabled={!secretValues[key]}
                  loading={savingKey === key}
                  onClick={() => handleSaveSecret(key)}
                >
                  Save
                </GlassButton>
                {secrets[hasKey] && (
                  <GlassButton
                    variant="danger"
                    size="md"
                    loading={savingKey === key}
                    onClick={() => handleClearSecret(key)}
                  >
                    Clear
                  </GlassButton>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Models Tab */}
        {activeTab === "models" && (
          <div className="space-y-4">
            <GlassSelect
              label="Transcription Provider"
              options={[
                { value: "auto", label: "Auto (whisper.cpp → OpenAI → YouTube)" },
                { value: "local-whispercpp", label: "Local whisper.cpp" },
                { value: "openai", label: "OpenAI Whisper API" },
              ]}
            />
            <GlassInput label="Text Analysis Model" placeholder="gpt-4.1-mini" defaultValue="gpt-4.1-mini" />
            <GlassInput label="Clip Selection Model" placeholder="gpt-4.1-mini" />
            <GlassInput label="Chapter Detection Model" placeholder="gpt-4.1-mini" />
            <GlassInput label="Whisper Model (local)" placeholder="small.en" defaultValue="small.en" />
          </div>
        )}

        {/* Paths Tab */}
        {activeTab === "paths" && (
          <div className="space-y-4">
            <GlassInput label="Project Root" disabled />
            <GlassInput label="Outputs Directory" disabled />
            <GlassInput label="Scene Library" disabled />
            <GlassInput label="SFX Library" disabled />
            <p className="text-xs text-text-muted">
              Paths are configured automatically. In dev mode, they use the repo root.
            </p>
          </div>
        )}

        {/* Cleanup Tab */}
        {activeTab === "cleanup" && (
          <div className="space-y-4">
            <p className="text-xs text-text-muted">Free up disk space by removing temporary files.</p>
            <div className="space-y-3">
              {[
                { id: "temp", label: "Temporary work files", desc: "Remove temp render and work files" },
                { id: "media-staging", label: "Media staging cache", desc: "Clear cached media copies" },
                { id: "old-outputs", label: "Old output folders", desc: "Keep last 5 runs, delete older ones" },
              ].map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3 border-b border-glass-border">
                  <div>
                    <div className="text-sm text-text-main">{item.label}</div>
                    <div className="text-xs text-text-muted">{item.desc}</div>
                  </div>
                  <GlassButton size="sm" onClick={() => handleCleanup(item.id)}>
                    Run
                  </GlassButton>
                </div>
              ))}
            </div>
            {cleanupResult && (
              <div className="p-3 glass-sm text-xs text-text-dim">{cleanupResult}</div>
            )}
          </div>
        )}

        {/* Environment Tab */}
        {activeTab === "environment" && (
          <div className="space-y-3">
            {env ? (
              <>
                <div className={`p-3 rounded-xl text-sm ${env.environment?.passed !== false ? "bg-accent-green/10 border border-accent-green/30 text-accent-green" : "bg-accent-rose/10 border border-accent-rose/30 text-accent-rose"}`}>
                  {env.environment?.passed !== false ? "✅ All required dependencies available" : "❌ Missing required dependencies"}
                </div>
                {env.environment?.required?.length > 0 && (
                  <div className="text-xs text-accent-rose">Missing required: {env.environment.required.join(", ")}</div>
                )}
                {env.environment?.optional?.length > 0 && (
                  <div className="text-xs text-text-dim">Optional tools not found: {env.environment.optional.join(", ")}</div>
                )}
                <div className="text-xs text-text-muted">
                  Last checked: {env.updatedAt ? new Date(env.updatedAt).toLocaleString() : "Unknown"}
                </div>
              </>
            ) : (
              <div className="text-sm text-text-muted">Environment check pending...</div>
            )}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
