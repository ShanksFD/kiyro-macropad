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

// Dev-only: lets `<UpdateChip />` (and the sidebar it lives in) be driven
// from the DevTools console without a real release cycle — set any status by
// hand and the chip re-renders live. Stripped from a production build since
// `next build` sets `NODE_ENV=production`, so this never ships. See
// `update-chip.tsx`'s comment for the exact console commands.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as typeof window & { __kiyroUpdateStore?: typeof useUpdateStore }).__kiyroUpdateStore =
    useUpdateStore;
}
