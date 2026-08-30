'use client';

import { create } from 'zustand';
import { readJson, StorageKey, writeJson } from '@/lib/storage/browser-storage';
import { ElectronPreferencesRepository } from '@/lib/storage/electron-preferences-repository';
import { DEFAULT_PREFERENCES, preferencesSchema } from '@/lib/preferences/schema';
import type { Preferences } from '@/lib/preferences/schema';

export { preferencesSchema, DEFAULT_PREFERENCES };
export type { Preferences };

const electronPreferences = new ElectronPreferencesRepository();

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
    set({ hydrated: true }); // set first: this is the re-entry guard, and the read below is async in Electron

    if (electronPreferences.isAvailable()) {
      electronPreferences
        .get()
        .then((stored) => set({ preferences: stored ?? DEFAULT_PREFERENCES }))
        .catch(() => undefined);
      return;
    }

    const stored = readJson(StorageKey.Preferences, preferencesSchema);
    set({ preferences: stored ?? DEFAULT_PREFERENCES });
  },

  setPreference: (key, value) => {
    const preferences = { ...get().preferences, [key]: value };
    if (electronPreferences.isAvailable()) void electronPreferences.set(preferences);
    else writeJson(StorageKey.Preferences, preferences);
    set({ preferences });
  },

  setDebugOpen: (debugOpen) => set({ debugOpen }),
  setTestMode: (testMode) => set({ testMode }),
  notify: (message, severity = 'success') => set({ toast: { message, severity } }),
  dismissToast: () => set({ toast: null }),
}));
