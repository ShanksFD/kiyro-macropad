'use client';

import { create } from 'zustand';
import type { SerialFrame } from '@/lib/protocol/types';

const MAX_FRAMES = 300;
/** Frames are flushed on a timer so a chatty device cannot thrash React. */
const FLUSH_INTERVAL_MS = 120;

interface EventLogStore {
  frames: SerialFrame[];
  /** Recording is opt-in: the console is a developer tool, not always-on state. */
  recording: boolean;
  paused: boolean;
  setRecording: (recording: boolean) => void;
  setPaused: (paused: boolean) => void;
  clear: () => void;
  /** Internal — used by the session bridge. */
  ingest: (frame: SerialFrame) => void;
}

let pending: SerialFrame[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export const useEventLogStore = create<EventLogStore>((set, get) => ({
  frames: [],
  recording: false,
  paused: false,

  setRecording: (recording) => set({ recording }),
  setPaused: (paused) => set({ paused }),
  clear: () => {
    pending = [];
    set({ frames: [] });
  },

  ingest: (frame) => {
    const { recording, paused } = get();
    if (!recording || paused) return;

    pending.push(frame);
    if (flushTimer) return;

    flushTimer = setTimeout(() => {
      flushTimer = null;
      const batch = pending;
      pending = [];
      if (batch.length === 0) return;

      set((state) => ({ frames: [...state.frames, ...batch].slice(-MAX_FRAMES) }));
    }, FLUSH_INTERVAL_MS);
  },
}));
