/**
 * Logging and crash reporting — the two things Kiyro previously had *none*
 * of once it left this machine.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every diagnostic Kiyro produced used to go to `console.*`. A packaged
 * Windows GUI build has no console attached to it, so all of it — including
 * `electron-updater`'s own play-by-play of an install attempt, which is the
 * only place the reason an update failed is ever stated — was written to
 * nowhere. When someone running a handed-out build says "I clicked restart
 * to update and nothing happened," there was literally no artifact anywhere
 * on their machine to look at, and no way to ask for one short of shipping
 * them a debug build.
 *
 * Two independent sinks, on purpose, because they fail in different ways:
 *
 * - **`electron-log` → a file on their disk.** Always works, needs no
 *   network, no account, and no DSN baked in. This is what you ask someone
 *   to send you. Path is `%APPDATA%\Kiyro\logs\main.log` on Windows,
 *   `~/Library/Logs/Kiyro/main.log` on macOS.
 * - **Sentry → your project.** Arrives without anyone having to notice
 *   anything went wrong or think to send you a file — which matters
 *   specifically for update failures, where the app is often *gone* (mid
 *   quit-and-install) at the moment the failure happens, so there is no UI
 *   left to complain in.
 *
 * Both no-op gracefully: no DSN baked in (a plain `npm run electron:dev`)
 * just means no Sentry, same as `update-token.ts` being empty means no
 * auto-update. Nothing here should ever be the reason the app fails to
 * start.
 */

import { app } from 'electron';
import log from 'electron-log/main';
import * as Sentry from '@sentry/electron/main';
import { SENTRY_DSN } from './sentry-dsn';
import { UPDATE_FEED_TOKEN } from './update-token';
import { DISCORD_CLIENT_SECRET } from './discord-secret';

export { log };

/**
 * Values that must never leave the machine inside an error report. These are
 * baked into the build (`scripts/generate-build-secrets.mjs`), so they're
 * live strings in this process and *can* end up inside an exception message,
 * a request URL, or a breadcrumb — `electron-updater` in particular builds
 * request options around the update token. Scrubbed below rather than
 * trusted not to appear: Sentry is an external service, and a token that
 * leaks into a third party's issue tracker is leaked whether or not the
 * issue is later deleted.
 *
 * Empty strings are filtered out — a `''` needle would otherwise match
 * everywhere and replace the entire event with redaction markers.
 */
const SECRETS_TO_SCRUB = [UPDATE_FEED_TOKEN, DISCORD_CLIENT_SECRET].filter((it) => it !== '');

function scrub<T>(value: T): T | null {
  if (SECRETS_TO_SCRUB.length === 0) return value;

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    // Circular or otherwise unserializable — can't prove it's clean, so
    // don't send it at all rather than send it unscrubbed. `null` is how
    // both Sentry hooks spell "drop this."
    return null;
  }

  let scrubbed = serialized;
  for (const secret of SECRETS_TO_SCRUB) {
    scrubbed = scrubbed.split(secret).join('[redacted]');
  }

  if (scrubbed === serialized) return value;
  return JSON.parse(scrubbed) as T;
}

/**
 * Must be called as early as possible in `main.ts` — before `app.whenReady()`
 * and before anything that could throw. Sentry's main-process SDK also
 * installs the hook that lets renderer-side errors reach the same project
 * (see `preload.ts`), and that has to be in place before any window exists.
 */
export function initObservability(): void {
  // Sets up the IPC plumbing `electron-log/renderer` needs. Harmless if the
  // renderer never uses it; has to happen before any window loads if it does.
  log.initialize();

  log.transports.file.level = 'info';
  // Default is 1 MB, which a chatty update/serial session can roll through
  // fast enough to lose the part you actually wanted.
  log.transports.file.maxSize = 5 * 1024 * 1024;
  // In a packaged build this goes nowhere anyway (no console attached); in
  // dev it's the terminal you're already watching.
  log.transports.console.level = app.isPackaged ? false : 'info';

  log.info(
    `[kiyro] starting ${app.getVersion()} (packaged=${app.isPackaged}, platform=${process.platform}, electron=${process.versions.electron})`,
  );
  log.info(`[kiyro] log file: ${log.transports.file.getFile().path}`);

  if (SENTRY_DSN === '') {
    log.warn('[kiyro] crash reporting disabled: no KIYRO_SENTRY_DSN baked in (see README.md)');
    return;
  }

  // A dev build reporting into the same project would bury real reports from
  // real installs under every crash from an editor save. Opt in for a
  // session with `KIYRO_SENTRY_DEV=1` when actually testing this wiring.
  const enabled = app.isPackaged || process.env['KIYRO_SENTRY_DEV'] === '1';

  Sentry.init({
    dsn: SENTRY_DSN,
    // Matches the tag `scripts/tag-release.mjs` pushes and the version
    // `electron-updater` compares against, so an issue in Sentry points at
    // exactly one release on GitHub.
    release: `kiyro@${app.getVersion()}`,
    environment: app.isPackaged ? 'production' : 'development',
    enabled,
    // Kiyro is a local desktop tool with no backend; performance tracing has
    // nothing to correlate against and would just cost quota.
    tracesSampleRate: 0,
    // Note this does NOT remove everything identifying: stack traces and log
    // lines carry absolute paths, which on Windows contain the account name
    // (`C:\Users\<name>\...`). That's kept deliberately — it's most of what
    // makes an install-location bug diagnosable — but it is worth knowing
    // before pointing this at anyone who hasn't agreed to it.
    sendDefaultPii: false,
    beforeSend: (event) => scrub(event),
    beforeBreadcrumb: (breadcrumb) => scrub(breadcrumb),
  });

  Sentry.setTag('platform', process.platform);
  Sentry.setTag('arch', process.arch);

  // `Sentry.init()` above always "succeeds" the moment a DSN is present —
  // this reflects whether it will actually *send* anything, which is the
  // thing worth knowing at a glance in the log. Was previously logged
  // unconditionally as "enabled" here regardless of the `enabled` option
  // above, which made a silently-disabled dev session indistinguishable
  // from a working one right at the one place meant to catch that.
  if (enabled) {
    log.info('[kiyro] crash reporting enabled');
  } else {
    log.warn(
      "[kiyro] crash reporting initialized but disabled (dev build without KIYRO_SENTRY_DEV=1) — nothing will be sent to Sentry this session",
    );
  }
}

/**
 * Log *and* report, in that order — the local file is the sink that always
 * works, so it must not be skipped just because Sentry is disabled or
 * offline. `context` becomes both a log line and Sentry `extra` data.
 */
export function captureError(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  const detail = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
  log.error(`[kiyro] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}${detail}`);
  Sentry.captureException(error, { extra: context });
}

/**
 * A problem that isn't an exception — nothing threw, the outcome was just
 * wrong (an update that reported success and then didn't apply, say). Worth
 * its own function because these are the failures with no stack trace to
 * hang an issue off, and they're exactly the ones that used to be invisible.
 */
export function captureProblem(
  message: string,
  context: Record<string, unknown> = {},
): void {
  const detail = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
  log.warn(`[kiyro] ${message}${detail}`);
  Sentry.captureMessage(message, { level: 'warning', extra: context });
}

/**
 * Pushes anything queued out to Sentry *now*, and resolves once it's gone (or
 * the timeout expires). Needed before a deliberate quit: `captureException`
 * is fire-and-forget over the network, and `quitAndInstall` kills this
 * process within a tick of being called — without this, the report of an
 * install that's about to fail is the report most likely to be lost.
 */
export async function flushReports(timeoutMs = 2000): Promise<void> {
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Never let telemetry be the reason a quit hangs or throws.
  }
}
