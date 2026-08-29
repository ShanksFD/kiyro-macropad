'use client';

import { z } from 'zod';
import { create } from 'zustand';
import { actionSchema } from '@/lib/actions/schema';
import { describeAction } from '@/lib/actions/format';
import type { Action } from '@/lib/actions/types';
import { readJson, writeJson } from '@/lib/storage/browser-storage';

const KEY = 'kiyro.quick-actions.v1';
const MAX_RECENT = 8;

const stateSchema = z.object({
  recent: z.array(actionSchema).max(MAX_RECENT).default([]),
  favourites: z.array(actionSchema).max(24).default([]),
});

interface QuickActionsStore {
  recent: Action[];
  favourites: Action[];
  hydrate: () => void;
  remember: (action: Action) => void;
  toggleFavourite: (action: Action) => void;
  isFavourite: (action: Action) => boolean;
}

const identity = (action: Action): string => describeAction(action).full;

/** Recently used and starred actions, so common bindings are one click away. */
export const useQuickActionsStore = create<QuickActionsStore>((set, get) => ({
  recent: [],
  favourites: [],

  hydrate: () => {
    const stored = readJson(KEY, stateSchema);
    if (stored) set({ recent: stored.recent, favourites: stored.favourites });
  },

  remember: (action) => {
    if (action.type === 'none') return;
    const recent = [
      action,
      ...get().recent.filter((item) => identity(item) !== identity(action)),
    ].slice(0, MAX_RECENT);
    set({ recent });
    writeJson(KEY, { recent, favourites: get().favourites });
  },

  toggleFavourite: (action) => {
    if (action.type === 'none') return;
    const exists = get().favourites.some((item) => identity(item) === identity(action));
    const favourites = exists
      ? get().favourites.filter((item) => identity(item) !== identity(action))
      : [...get().favourites, action];
    set({ favourites });
    writeJson(KEY, { recent: get().recent, favourites });
  },

  isFavourite: (action) => get().favourites.some((item) => identity(item) === identity(action)),
}));
