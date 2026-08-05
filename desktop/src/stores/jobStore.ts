import { create } from "zustand";

export interface JobState {
  sessionId: string;
  workflowId: string;
  workflowTitle?: string;
  status: "running" | "completed" | "error";
  stage?: string;
  percent?: number;
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
  error?: string;
  logs: { timestamp: string; channel: "stdout" | "stderr"; text: string }[];
}

interface JobStore {
  currentJob: JobState | null;
  jobHistory: JobState[];
  setJob: (job: JobState) => void;
  updateJob: (update: Partial<JobState>) => void;
  appendLog: (entry: JobState["logs"][0]) => void;
  clearJob: () => void;
}

export const useJobStore = create<JobStore>((set) => ({
  currentJob: null,
  jobHistory: [],

  setJob: (job) =>
    set((state) => ({
      currentJob: job,
      jobHistory: [job, ...state.jobHistory].slice(0, 50),
    })),

  updateJob: (update) =>
    set((state) => ({
      currentJob: state.currentJob
        ? { ...state.currentJob, ...update }
        : null,
    })),

  appendLog: (entry) =>
    set((state) => ({
      currentJob: state.currentJob
        ? {
            ...state.currentJob,
            logs: [...state.currentJob.logs.slice(-4999), entry],
          }
        : null,
    })),

  clearJob: () => set({ currentJob: null }),
}));
