'use client';

import { create } from 'zustand';
import type { Action, BindingMap } from '@/lib/actions/types';
import { bindingsEqual, normalizeBindings } from '@/lib/profiles/factory';
import type { MacroProfile } from '@/lib/profiles/types';

interface EditorStore {
  /** Profile currently loaded into the editor. */
  profileId: string | null;
  /** What the user is editing right now. */
  draft: BindingMap;
  /** Last state written to local storage — the dirty comparison baseline. */
  baseline: BindingMap;
  selectedControlId: string | null;
  isDirty: boolean;
  /** Action copied from one control, ready to paste onto another. */
  clipboard: Action | null;

  load: (profile: MacroProfile) => void;
  select: (controlId: string | null) => void;
  setAction: (controlId: string, action: Action) => void;
  clearAction: (controlId: string) => void;
  /** Replaces every binding at once, e.g. when a profile is imported. */
  setAll: (bindings: BindingMap) => void;
  /** Discards edits made since the last local save. */
  revert: () => void;
  /** Empties every binding in the draft. */
  clearAll: () => void;
  markSaved: (bindings: BindingMap) => void;
  copyAction: (action: Action) => void;
}

const recompute = (draft: BindingMap, baseline: BindingMap) => ({
  isDirty: !bindingsEqual(draft, baseline),
});

export const useEditorStore = create<EditorStore>((set, get) => ({
  profileId: null,
  draft: {},
  baseline: {},
  selectedControlId: null,
  isDirty: false,
  clipboard: null,

  load: (profile) => {
    const bindings = normalizeBindings(profile.bindings);
    set({
      profileId: profile.id,
      draft: bindings,
      baseline: bindings,
      isDirty: false,
      selectedControlId: null,
    });
  },

  setAll: (bindings) => {
    const draft = normalizeBindings(bindings);
    set({ draft, ...recompute(draft, get().baseline) });
  },

  select: (controlId) => set({ selectedControlId: controlId }),

  setAction: (controlId, action) => {
    const draft =
      action.type === 'none'
        ? omit(get().draft, controlId)
        : { ...get().draft, [controlId]: action };
    set({ draft, ...recompute(draft, get().baseline) });
  },

  clearAction: (controlId) => {
    const draft = omit(get().draft, controlId);
    set({ draft, ...recompute(draft, get().baseline) });
  },

  revert: () => {
    const baseline = get().baseline;
    set({ draft: baseline, isDirty: false });
  },

  clearAll: () => {
    set({ draft: {}, ...recompute({}, get().baseline) });
  },

  markSaved: (bindings) => set({ draft: bindings, baseline: bindings, isDirty: false }),

  copyAction: (clipboard) => set({ clipboard }),
}));

function omit(bindings: BindingMap, key: string): BindingMap {
  if (!(key in bindings)) return bindings;
  const next = { ...bindings };
  delete next[key];
  return next;
}

/** Subscribe to a single control's action without re-rendering on unrelated edits. */
export const selectAction =
  (controlId: string) =>
  (state: EditorStore): Action | undefined =>
    state.draft[controlId];
