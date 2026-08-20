// Global type for the window.cca IPC bridge exposed by desktop/preload.cjs.
// Channel names and shapes must match desktop/shared/protocol.mjs.

import type {WorkflowDefinition} from '../stores/workflowStore';

interface CcaBridge {
  // Workflow management
  listWorkflows(): Promise<
    | {
        workflows: WorkflowDefinition[];
        environment: {passed: boolean; required?: string[]; optional?: string[]};
        detectedCommands: string[];
        commandMetadata: unknown[];
        validation: unknown;
        generatedAt?: string;
      }
    | undefined
  >;
  getEnvironment(): Promise<{environment?: {passed: boolean}} | undefined>;
  runWorkflow(payload: {
    workflowId: string;
    argValues?: Record<string, unknown>;
    extraArgs?: string;
  }): Promise<{session: string; command: string; startedAt: string} | undefined>;
  stopWorkflow(session?: string): Promise<{stopped: boolean; reason?: string | null}>;
  listJobs(): Promise<Array<Record<string, unknown>>>;
  getJob(id: string): Promise<Record<string, unknown>>;
  getJobLogs(
    id: string,
    offsets?: {stdoutOffset?: number; stderrOffset?: number},
  ): Promise<unknown>;

  // Preferences & secrets
  getPreferences(): Promise<Record<string, unknown> | undefined>;
  setPreference(key: string, value: unknown): Promise<Record<string, unknown> | undefined>;
  getSecretState(): Promise<
    | {
        hasOpenAI: boolean;
        hasDeepSeek: boolean;
        hasYouTube: boolean;
        hasFal: boolean;
        hasElevenLabs: boolean;
      }
    | undefined
  >;
  setSecret(payload: {key: string; value: string}): Promise<unknown>;
  clearSecret(payload: {key: string}): Promise<unknown>;

  // File dialogs & shell
  projectRoot(): Promise<string>;
  pickPath(options?: {
    directories?: boolean;
    defaultPath?: string;
    title?: string;
    buttonLabel?: string;
    filters?: Array<{name: string; extensions: string[]}>;
  }): Promise<{canceled: boolean; filePaths: string[]} | undefined>;
  openPath(
    targetPath: string,
  ): Promise<{opened: boolean; error?: string; path?: string} | undefined>;
  getLogPath(): Promise<string>;
  getPaths(): Promise<
    | {
        projectRoot: string;
        outputsRoot: string;
        userDataRoot: string;
        configRoot: string;
      }
    | undefined
  >;

  // Output browsing
  listOutputs(): Promise<Array<{name: string; path: string; type: string; date: string}>>;

  // Project files (allowlist enforced in main)
  readProjectFile(name: string): Promise<string>;
  writeProjectFile(name: string, content: string): Promise<{ok: boolean}>;

  // Cleanup
  cleanup(scope: string): Promise<{ok: boolean; cleaned?: string[]; error?: string}>;

  // Video probing (ffprobe, read-only)
  probeVideo(filePath: string): Promise<Record<string, unknown> | undefined>;

  // Events (main → renderer); each returns an unsubscribe function
  onLog(
    callback: (payload: {
      session: string;
      channel: string;
      text: string;
      timestamp: string;
    }) => void,
  ): () => void;
  onComplete(
    callback: (payload: {
      session: string;
      code: number | null;
      signal: string | null;
      error?: string;
    }) => void,
  ): () => void;
  onEnvironment(callback: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    cca?: CcaBridge;
  }
}

export {};
