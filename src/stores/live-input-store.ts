'use client';

import { create } from 'zustand';
import type { DeviceEvent } from '@/lib/protocol/types';
import type { EventResolution } from '@/lib/devices/types';
import type { Action } from '@/lib/actions/types';
import type { ExecutionOutcome } from '@/lib/execution/executor';

/** How long a control stays lit after a hardware event, in milliseconds. */
const HIGHLIGHT_MS = 220;

export interface LiveEventRecord {
  event: DeviceEvent;
  resolution: EventResolution;
  at: number;
}

/** The binding a live event resolved to, and what happened when it was run. */
export interface DispatchRecord {
  controlId: string;
  action: Action;
  outcome: ExecutionOutcome;
  at: number;
}

interface LiveInputStore {
  /** controlId -> timestamp of the pulse currently lighting it. */
  active: Record<string, number>;
  /** Most recent input event, whether or not it resolved to a control. */
  last: LiveEventRecord | null;
  /** Firmware codes seen that no control claims — surfaced in test mode. */
  unmapped: Record<string, number>;
  /** Most recent binding an event resolved to, with its execution outcome. */
  lastDispatch: DispatchRecord | null;
  pulse: (controlIds: string[]) => void;
  record: (record: LiveEventRecord) => void;
  dispatch: (record: DispatchRecord) => void;
  clear: () => void;
}

/**
 * Live hardware feedback.
 *
 * Kept separate from the editor so a burst of encoder pulses only re-renders the
 * controls that actually lit up — components subscribe to their own key.
 */
export const useLiveInputStore = create<LiveInputStore>((set, get) => ({
  active: {},
  last: null,
  unmapped: {},
  lastDispatch: null,

  pulse: (controlIds) => {
    if (controlIds.length === 0) return;
    const at = Date.now();

    set((state) => {
      const active = { ...state.active };
      for (const id of controlIds) active[id] = at;
      return { active };
    });

    setTimeout(() => {
      const active = { ...get().active };
      let changed = false;
      for (const id of controlIds) {
        // Only clear if a newer pulse has not replaced this one.
        if (active[id] === at) {
          delete active[id];
          changed = true;
        }
      }
      if (changed) set({ active });
    }, HIGHLIGHT_MS);
  },

  record: (record) =>
    set((state) => {
      if (record.resolution.status !== 'unmapped') return { last: record };

      const key = describeUnmapped(record.event);
      if (!key) return { last: record };
      return {
        last: record,
        unmapped: { ...state.unmapped, [key]: (state.unmapped[key] ?? 0) + 1 },
      };
    }),

  dispatch: (lastDispatch) => set({ lastDispatch }),

  clear: () => set({ active: {}, last: null, unmapped: {}, lastDispatch: null }),
}));

function describeUnmapped(event: DeviceEvent): string | null {
  switch (event.type) {
    case 'button':
      return `BTN:${event.code}`;
    case 'encoderButton':
      return `ENC_BTN:${event.code}`;
    case 'longPress':
      return `LONG:${event.code}`;
    case 'unknown':
      return event.raw;
    default:
      return null;
  }
}

/** Selector factory — components subscribe to a single control's live state. */
export const selectIsLive =
  (controlId: string) =>
  (state: LiveInputStore): boolean =>
    state.active[controlId] !== undefined;
