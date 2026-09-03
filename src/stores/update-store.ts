'use client';

import { create } from 'zustand';
import type { UpdaterStatusPayload } from '@/lib/electron/ipc-types';

/**
 * Mirrors `electron/updater.ts`'s state — nothing here does any checking or
 * downloading itself, it only reflects what main already did or is doing.
 * `setStatus` is called from `use-app-bootstrap.ts`'s subscription to
 * `window.kiyro.updater.onStatus`, and directly by the actions below with
 * whatever `check()`/`download()`/`quitAndInstall()` resolve or push.
 */
export const useUpdateStore = create<{
  status: UpdaterStatusPayload;
  setStatus: (status: UpdaterStatusPayload) => void;
}>((set) => ({
  status: { state: 'idle' },
  setStatus: (status) => set({ status }),
}));
