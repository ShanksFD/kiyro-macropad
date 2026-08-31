'use client';

import { useEffect, useState } from 'react';
import type { KiyroBridge } from '@/lib/electron/ipc-types';

/**
 * `window.kiyro` only ever exists on the client, but reading it directly in
 * a render body — even guarded by `typeof window !== 'undefined'` — still
 * causes a hydration mismatch: this app's HTML is statically exported with
 * no `window` at all, yet Electron's preload script injects `window.kiyro`
 * *synchronously*, before any page script runs, so by the time React
 * hydrates, the very first client render already disagrees with the
 * bridge-less server render. Deferring to a post-mount effect keeps that
 * first client render matching the server one exactly — `window.kiyro`
 * only shows up one render later, as an ordinary post-mount update.
 */
export function useKiyroBridge(): KiyroBridge | null {
  const [bridge, setBridge] = useState<KiyroBridge | null>(null);

  useEffect(() => {
    setBridge(window.kiyro ?? null);
  }, []);

  return bridge;
}
