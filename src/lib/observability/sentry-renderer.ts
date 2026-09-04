'use client';

/**
 * Renderer half of Kiyro's crash reporting. The main process
 * (`electron/observability.ts`) owns the actual Sentry client — the DSN, the
 * enable/disable decision, the secret scrubbing — and this side deliberately
 * owns none of it.
 *
 * That's what `init()` with no options means here: `@sentry/electron/renderer`
 * doesn't open its own connection to Sentry, it forwards what it captures
 * over the channel `electron/preload.ts` exposes, and the main process sends
 * it. So there is nothing to configure twice, nothing to keep in sync, and no
 * DSN to plumb into the renderer bundle — and a build with no DSN baked in
 * disables both halves at once, automatically.
 *
 * Guarded on `window.kiyro` because this same static export can be opened in
 * an ordinary browser (`src/app/page.tsx` handles that case), where the
 * preload never ran, there is no main process to forward to, and initializing
 * would just log a warning into the user's console every load.
 */

let initialized = false;

export function initRendererObservability(): void {
  if (initialized) return;
  if (typeof window === 'undefined' || !window.kiyro) return;
  initialized = true;

  // Dynamic, not a top-level import: this pulls in `@sentry/browser`, which
  // has no business being in the bundle's critical path for a UI that spends
  // most of its life not crashing. It also keeps the module out of the
  // non-Electron path entirely.
  void import('@sentry/electron/renderer')
    .then(({ init }) => {
      init({
        // Tags the renderer's reports with the same string
        // `electron/observability.ts` uses for the main process, so both
        // halves of one crash land on one release in Sentry.
        release: `kiyro@${process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown'}`,
      });
    })
    .catch((error: unknown) => {
      // Reporting that reporting failed has nowhere to go by definition.
      console.error('[kiyro] could not initialize renderer crash reporting', error);
    });
}
