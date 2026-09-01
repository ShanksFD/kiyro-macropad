import { redirect } from 'next/navigation';

/**
 * No separate home/landing page — Kiyro opens straight to Configure.
 * Electron's `createWindow()` (`electron/main.ts`) already points its
 * initial load at `/configure` directly, so this only ever runs for a
 * direct visit to `/` outside Electron (the Web Serial browser fallback).
 */
export default function Page() {
  redirect('/configure');
}
