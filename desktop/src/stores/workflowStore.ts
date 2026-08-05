import { create } from "zustand";

export interface WorkflowArg {
  name: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "path" | "textarea";
  placeholder?: string;
  required?: boolean;
  value?: string | number | boolean;
  options?: { value: string; label: string }[];
}

export interface WorkflowDefinition {
  id: string;
  title: string;
  command: string;
  description: string;
  args?: WorkflowArg[];
  source?: string;
  group?: string;
}

interface WorkflowStore {
  workflows: WorkflowDefinition[];
  environment: { passed: boolean; required?: string[]; optional?: string[] } | null;
  setWorkflows: (workflows: WorkflowDefinition[]) => void;
  setEnvironment: (env: WorkflowStore["environment"]) => void;
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  workflows: [],
  environment: null,

  setWorkflows: (workflows) => set({ workflows }),
  setEnvironment: (environment) => set({ environment }),
}));
