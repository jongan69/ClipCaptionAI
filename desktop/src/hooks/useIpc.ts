/**
 * Typed wrapper around the window.cca IPC bridge.
 *
 * All invoke calls go through these hooks so components don't
 * need to deal with window.cca or null checks directly.
 */

import { useEffect, useCallback, useState } from "react";
import { useJobStore, type JobState } from "../stores/jobStore";
import { useWorkflowStore, type WorkflowDefinition } from "../stores/workflowStore";
import { useSettingsStore, type SecretState, type Preferences } from "../stores/settingsStore";

// ── CCA bridge accessor ──────────────────────────────────────────

function cca() {
  return (window as any).cca;
}

// ── Workflow hooks ───────────────────────────────────────────────

export function useWorkflows() {
  const setWorkflows = useWorkflowStore((s) => s.setWorkflows);
  const setEnvironment = useWorkflowStore((s) => s.setEnvironment);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await cca()?.listWorkflows();
        if (data?.workflows) setWorkflows(data.workflows);
        if (data?.environment) setEnvironment(data.environment);
      } catch {
        // CCA not available (dev outside Electron)
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { loading };
}

export function useRunWorkflow() {
  const setJob = useJobStore((s) => s.setJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const appendLog = useJobStore((s) => s.appendLog);
  const [running, setRunning] = useState(false);

  // Subscribe to log/completion events
  useEffect(() => {
    const unsubLog = cca()?.onLog((payload: any) => {
      appendLog({
        timestamp: payload.timestamp || new Date().toISOString(),
        channel: payload.channel || "stdout",
        text: payload.text || "",
      });
    });

    const unsubComplete = cca()?.onComplete((payload: any) => {
      updateJob({
        status: payload.error || payload.code !== 0 ? "error" : "completed",
        exitCode: payload.code,
        error: payload.error,
        endedAt: new Date().toISOString(),
        percent: 100,
      });
      setRunning(false);
    });

    const unsubProgress = cca()?.onJobProgress((payload: any) => {
      updateJob({
        percent: payload.percent,
        stage: payload.stage,
      });
    });

    return () => {
      unsubLog?.();
      unsubComplete?.();
      unsubProgress?.();
    };
  }, []);

  const run = useCallback(
    async (workflowId: string, title: string, argValues: Record<string, any> = {}, extraArgs = "") => {
      setRunning(true);
      const sessionId = crypto.randomUUID?.() || Date.now().toString(36);

      setJob({
        sessionId,
        workflowId,
        workflowTitle: title,
        status: "running",
        startedAt: new Date().toISOString(),
        logs: [],
      });

      try {
        const result = await cca()?.runWorkflow({ workflowId, argValues, extraArgs });
        if (result?.session) {
          updateJob({ sessionId: result.session });
        }
      } catch (error: any) {
        updateJob({
          status: "error",
          error: error?.message || String(error),
          endedAt: new Date().toISOString(),
        });
        setRunning(false);
      }
    },
    [setJob, updateJob, setRunning]
  );

  const stop = useCallback(async () => {
    const job = useJobStore.getState().currentJob;
    if (job?.sessionId) {
      await cca()?.stopWorkflow(job.sessionId);
    }
  }, []);

  return { run, stop, running };
}

// ── Settings hooks ──────────────────────────────────────────────

export function usePreferences() {
  const setPreferences = useSettingsStore((s) => s.setPreferences);

  useEffect(() => {
    (async () => {
      try {
        const prefs = await cca()?.getPreferences();
        if (prefs) setPreferences(prefs);
      } catch {}
    })();
  }, []);

  const setPref = useCallback(async (key: string, value: any) => {
    await cca()?.setPreference(key, value);
    const updated = await cca()?.getPreferences();
    if (updated) setPreferences(updated);
  }, []);

  return { setPref };
}

export function useSecrets() {
  const setSecrets = useSettingsStore((s) => s.setSecrets);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const state = await cca()?.getSecretState();
        if (state) setSecrets(state);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const saveSecret = useCallback(async (key: string, value: string) => {
    await cca()?.setSecret({ key, value });
    const state = await cca()?.getSecretState();
    if (state) setSecrets(state);
  }, []);

  const clearSecret = useCallback(async (key: string) => {
    await cca()?.clearSecret({ key });
    const state = await cca()?.getSecretState();
    if (state) setSecrets(state);
  }, []);

  return { saveSecret, clearSecret, loading };
}

// ── File/Path hooks ─────────────────────────────────────────────

export function useFilePicker() {
  const pickFile = useCallback(async (options: any = {}) => {
    const result = await cca()?.pickPath({ ...options });
    if (result?.filePaths?.[0]) return result.filePaths[0];
    return null;
  }, []);

  const pickDirectory = useCallback(async (options: any = {}) => {
    const result = await cca()?.pickPath({ directories: true, ...options });
    if (result?.filePaths?.[0]) return result.filePaths[0];
    return null;
  }, []);

  return { pickFile, pickDirectory };
}

export function useOpenPath() {
  return useCallback(async (targetPath: string) => {
    await cca()?.openPath(targetPath);
  }, []);
}

// ── Environment hook ────────────────────────────────────────────

export function useEnvironment() {
  const setEnvironment = useWorkflowStore((s) => s.setEnvironment);
  const [env, setEnv] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await cca()?.getEnvironment();
        if (data) {
          setEnv(data);
          if (data.environment) setEnvironment(data.environment);
        }
      } catch {}
    })();

    const unsub = cca()?.onEnvironment((payload: any) => {
      if (payload) {
        setEnv(payload);
        if (payload.environment) setEnvironment(payload.environment);
      }
    });

    return () => unsub?.();
  }, []);

  return env;
}
