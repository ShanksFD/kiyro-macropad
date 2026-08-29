'use client';

import { z } from 'zod';
import { create } from 'zustand';
import { readJson, StorageKey, writeJson } from '@/lib/storage/browser-storage';

export const preferencesSchema = z.object({
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  /** Reopen the last authorised port automatically on load. */
  autoReconnect: z.boolean().default(false),
  confirmBeforeReset: z.boolean().default(true),
  /** Write editor changes to the active local profile as they happen. */
  autoSaveLocal: z.boolean().default(false),
  /** Reveals the developer section: simulator, raw events, protocol diagnostics. */
  advancedMode: z.boolean().default(false),
  showRawEvents: z.boolean().default(false),
});

export type Preferences = z.infer<typeof preferencesSchema>;

const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});

interface UiStore {
  preferences: Preferences;
  hydrated: boolean;
  /** Debug console drawer. */
  debugOpen: boolean;
  /** Highlights controls and reports raw codes as keys are pressed. */
  testMode: boolean;
  toast: { message: string; severity: 'success' | 'info' | 'warning' | 'error' } | null;

  hydrate: () => void;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  setDebugOpen: (open: boolean) => void;
  setTestMode: (enabled: boolean) => void;
  notify: (message: string, severity?: 'success' | 'info' | 'warning' | 'error') => void;
  dismissToast: () => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  preferences: DEFAULT_PREFERENCES,
  hydrated: false,
  debugOpen: false,
  testMode: false,
  toast: null,

  hydrate: () => {
    if (get().hydrated) return;
    const stored = readJson(StorageKey.Preferences, preferencesSchema);
    set({ hydrated: true, preferences: stored ?? DEFAULT_PREFERENCES });
  },

  setPreference: (key, value) => {
    const preferences = { ...get().preferences, [key]: value };
    writeJson(StorageKey.Preferences, preferences);
    set({ preferences });
  },

  setDebugOpen: (debugOpen) => set({ debugOpen }),
  setTestMode: (testMode) => set({ testMode }),
  notify: (message, severity = 'success') => set({ toast: { message, severity } }),
  dismissToast: () => set({ toast: null }),
}));
