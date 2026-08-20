import {create} from 'zustand';

export interface SecretState {
  hasOpenAI: boolean;
  hasDeepSeek: boolean;
  hasYouTube: boolean;
  hasFal: boolean;
  hasElevenLabs: boolean;
}

export interface Preferences {
  lastWorkflowId?: string;
  windowBounds?: {width: number; height: number; x?: number; y?: number};
  formDrafts?: Record<string, Record<string, string>>;
}

interface SettingsStore {
  preferences: Preferences;
  secrets: SecretState;
  setPreferences: (prefs: Preferences) => void;
  setSecrets: (secrets: SecretState) => void;
  updateDraft: (workflowId: string, key: string, value: string) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  preferences: {},
  secrets: {
    hasOpenAI: false,
    hasDeepSeek: false,
    hasYouTube: false,
    hasFal: false,
    hasElevenLabs: false,
  },

  setPreferences: (preferences) => set({preferences}),
  setSecrets: (secrets) => set({secrets}),

  updateDraft: (workflowId, key, value) =>
    set((state) => ({
      preferences: {
        ...state.preferences,
        formDrafts: {
          ...state.preferences.formDrafts,
          [workflowId]: {
            ...state.preferences.formDrafts?.[workflowId],
            [key]: value,
          },
        },
      },
    })),
}));
