'use client';

import { create } from 'zustand';
import type { DiscordStatusPayload } from '@/lib/electron/ipc-types';

/**
 * Mirrors `electron/discord-rpc.ts`'s connection state — nothing here
 * connects or talks to Discord itself, it only reflects what main already
 * did (`use-app-bootstrap.ts`'s subscription to `window.kiyro.discord.onStatus`)
 * or is told directly by a `connect()` call's own resolved value (Settings'
 * "Connect" button).
 */
export const useDiscordStore = create<{
  status: DiscordStatusPayload;
  setStatus: (status: DiscordStatusPayload) => void;
}>((set) => ({
  status: { state: 'disconnected' },
  setStatus: (status) => set({ status }),
}));
