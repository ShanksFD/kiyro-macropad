/**
 * Update checking via `electron-updater`, reading Kiyro's own GitHub
 * Releases — but the update itself is never silent or automatic. Kiyro
 * checks in the background (so the UI can surface "an update is available"
 * without anyone having to think to ask), but downloading and installing are
 * both actions the user takes explicitly — a button when one's available
 * (`Sidebar`), and a "Check for Updates…" item in the Help menu
 * (`WindowMenu`) to ask on demand. `autoDownload`/`autoInstallOnAppQuit` are
 * both off below specifically so nothing happens on anyone's machine without
 * them clicking something.
 *
 * This repo is private, which `electron-updater` supports — but only by
 * shipping a GitHub access token inside every copy of the app, since a
 * private repo's release assets need authentication to download at all. Two
 * separate tokens are involved, and mixing them up is the mistake to avoid:
 *
 * - **The publish token** (`GH_TOKEN`, used only on the machine that runs
 *   `npm run dist:win:publish` to cut a release) needs *write* access, to
 *   create the release and upload its assets. It never leaves that machine
 *   and is never baked into the app.
 * - **The runtime token** (`KIYRO_UPDATE_TOKEN`, baked in below via
 *   `scripts/generate-build-secrets.mjs` at build time) needs only *read*
 *   access, and ships inside every build handed out to anyone. Anyone who
 *   receives the app can extract this token — it's a plain string in the
 *   packaged JS — and use it to read the private repo, same as a real
 *   collaborator with read access would. That's an accepted tradeoff of
 *   "private repo, no update server" specifically, not a bug: GitHub has no
 *   token scope narrower than repo-content-read that still covers release
 *   assets, so there is no way to authorize "downloads only." Use a
 *   fine-grained personal access token scoped to *only* this one repo, with
 *   *only* `Contents: Read-only`, give it an expiry, and rotate it
 *   (generate a new one, cut a new release built with it) before it expires
 *   — see README.md's "Releasing and auto-updates" section.
 *
 * electron-builder's own docs are explicit that the runtime token must never
 * be written into a configuration file (`package.json`'s `build.publish`) —
 * only ever set programmatically via `setFeedURL`, which is exactly what
 * this does.
 *
 * DIAGNOSING A FAILED UPDATE
 * --------------------------
 * Everything here logs to `observability.ts`'s file sink, which for a
 * handed-out Windows build means `%APPDATA%\Kiyro\logs\main.log` on the
 * machine that hit the problem — including `electron-updater`'s own output
 * (`autoUpdater.logger` below), which is the only place the reason an
 * install failed is ever stated. Ask for that file first. Real failures also
 * reach Sentry on their own, which matters most for the install step, where
 * the app is deliberately quitting at the exact moment things can go wrong
 * and there is no UI left to report into.
 */

import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { IpcChannel } from '../src/lib/electron/ipc-types';
import type { UpdaterStatusPayload } from '../src/lib/electron/ipc-types';
import { UPDATE_FEED_TOKEN } from './update-token';
import { captureError, captureProblem, flushReports, log } from './observability';

/** Background re-check cadence — Kiyro is meant to keep running in the tray for long stretches between restarts, so launch alone isn't enough. Never triggers a download by itself. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Written just before handing control to the installer, read on the next
 * launch, deleted either way.
 *
 * This is the only way to find out that an install *silently didn't take*.
 * `quitAndInstall` is close to unfalsifiable from inside this process:
 * `electron-updater` considers the job done the moment the installer process
 * has a pid, and this app is killed a tick later — so an installer that
 * gets quarantined by antivirus, refused by SmartScreen, or unpacks into a
 * different directory than the shortcut points at all look identical to
 * success from here. Comparing the version we *hoped* to be running against
 * the version we actually came back as is the check that catches every one
 * of those.
 */
interface UpdateAttempt {
  attemptedVersion: string;
  fromVersion: string;
  at: string;
}

/**
 * A check that failed because the network moved, not because anything is
 * wrong with Kiyro or the release feed.
 *
 * These are unavoidable on a laptop: `ERR_NETWORK_CHANGED` is Chromium
 * saying the machine switched Wi-Fi/VPN/adapters mid-request, and the rest
 * are the ordinary offline/asleep/DNS-not-up-yet cases. Kiyro checks every
 * few hours in the background forever, so *every* user will hit these
 * routinely — treating them as errors meant a Sentry event and a red
 * "Update failed" toast for something that fixes itself on the next check
 * and that the user can do nothing about.
 *
 * Matched on the message because that is all there is: electron-updater
 * wraps the underlying failure in its own `Error` (see the
 * "Unable to find latest version on GitHub" text), so any error code or
 * cause on the original is gone by the time it reaches us.
 */
const TRANSIENT_NETWORK_ERROR = new RegExp(
  [
    'ERR_NETWORK_CHANGED',
    'ERR_INTERNET_DISCONNECTED',
    'ERR_NAME_NOT_RESOLVED',
    'ERR_CONNECTION_RESET',
    'ERR_CONNECTION_ABORTED',
    'ERR_CONNECTION_CLOSED',
    'ERR_CONNECTION_TIMED_OUT',
    'ERR_CONNECTION_REFUSED',
    'ERR_ADDRESS_UNREACHABLE',
    'ERR_PROXY_CONNECTION_FAILED',
    'ERR_TIMED_OUT',
    'ENOTFOUND',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
  ].join('|'),
);

function isTransientNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_NETWORK_ERROR.test(message);
}

export class AppUpdater {
  #ready = false;
  #status: UpdaterStatusPayload = { state: 'idle' };
  /** Whether the in-flight check came from the Help menu rather than the background timer — see `#handleOfflineCheck`. */
  #userInitiatedCheck = false;
  /** The status to rewind to if the in-flight check can't reach the network. */
  #statusBeforeCheck: UpdaterStatusPayload = { state: 'idle' };

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  /** Wires up the feed and starts background checking. Safe to call unconditionally — no-ops in dev or when this build has no runtime token baked in, rather than failing loudly either way. */
  init(): void {
    if (!app.isPackaged) {
      log.info('[kiyro] auto-update disabled: not a packaged build');
      return;
    }

    this.#reportPreviousAttempt();

    if (UPDATE_FEED_TOKEN === '') {
      log.warn(
        '[kiyro] auto-update disabled: this build has no KIYRO_UPDATE_TOKEN baked in (see README.md)',
      );
      return;
    }

    // Routes electron-updater's own play-by-play into the log file. Without
    // this it defaults to `console`, which in a packaged Windows build is
    // attached to nothing at all — see this file's doc comment.
    autoUpdater.logger = log;

    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'ShanksFD',
      repo: 'kiyro-macropad',
      private: true,
      token: UPDATE_FEED_TOKEN,
    });

    // Both off: checking is passive and safe to run unattended, but nothing
    // downloads or installs without the user asking for it via `download()`/
    // `quitAndInstall()` below.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    // Kiyro ships one full NSIS installer per release (`nsis` config in
    // package.json), never a web installer. Saying so explicitly silences a
    // warning electron-updater otherwise logs on every single download.
    autoUpdater.disableWebInstaller = true;

    autoUpdater.on('checking-for-update', () => {
      // A background re-check must not walk back over a download the user
      // already paid for — see `check()`, which won't even start one in
      // those states. This only guards the event, in case a check is already
      // in flight when a download finishes.
      if (this.#status.state === 'downloading' || this.#status.state === 'downloaded') return;
      this.#setStatus({ state: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
      // Same reasoning: with `autoDownload` off, electron-updater re-emits
      // `update-available` on *every* later check, including ones that
      // happen long after the user already downloaded that exact version.
      // Taking it at face value would flip a finished "Restart to update"
      // button back to "Update 0.2.0" on its own every four hours and
      // strand the staged installer.
      if (this.#status.state === 'downloading' || this.#status.state === 'downloaded') return;
      this.#setStatus({ state: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
      if (this.#status.state === 'downloading' || this.#status.state === 'downloaded') return;
      this.#setStatus({ state: 'not-available' });
    });
    autoUpdater.on('download-progress', (progress) =>
      this.#setStatus({ state: 'downloading', percent: Math.round(progress.percent) }),
    );
    autoUpdater.on('update-downloaded', (info) =>
      this.#setStatus({ state: 'downloaded', version: info.version }),
    );
    autoUpdater.on('error', (error) => {
      // A network blip during a background check is not a failure worth
      // reporting or interrupting anyone over — it stays in the log only,
      // and the status is left exactly as it was so the UI doesn't flip to
      // an error the user can neither act on nor dismiss. A *download* or
      // *install* failing is different: the user asked for that and is
      // waiting on it, so it still surfaces even if the cause was the
      // network.
      if (
        isTransientNetworkError(error) &&
        this.#status.state !== 'downloading' &&
        this.#status.state !== 'downloaded'
      ) {
        this.#handleOfflineCheck(error);
        return;
      }

      captureError(error, { phase: 'updater', status: this.#status.state });
      this.#setStatus({ state: 'error', message: error.message });
    });

    this.#ready = true;
    void this.check();
    setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  /** Read-only: asks GitHub what the latest release is. Never downloads anything by itself. Returns the resulting status so a caller (the Help menu's "Check for Updates…") can show its own immediate feedback instead of racing the broadcast channel. */
  async check({ userInitiated = false } = {}): Promise<UpdaterStatusPayload> {
    if (!this.#ready) return this.#status;

    // Read by `#handleOfflineCheck` — a network failure is silent for the
    // background timer but must be *said* when someone clicked the button.
    this.#userInitiatedCheck = userInitiated;
    // What to fall back to if this check can't complete, so a failed check
    // doesn't leave the UI stuck on 'checking' forever, and doesn't claim
    // "up to date" on the strength of a request that never landed.
    this.#statusBeforeCheck = this.#status;

    // Nothing a check can discover is more useful than an update that's
    // already downloaded and waiting for the user to click restart.
    if (this.#status.state === 'downloading' || this.#status.state === 'downloaded') {
      return this.#status;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      // Already turned into an `error` status by the `'error'` listener
      // above in the normal case; this only catches a check that failed
      // before electron-updater got far enough to emit that event at all.
      if (isTransientNetworkError(error)) {
        this.#handleOfflineCheck(error);
        return this.#status;
      }

      captureError(error, { phase: 'checkForUpdates' });
      this.#setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Update check failed',
      });
    }

    return this.#status;
  }

  /** Explicit, user-initiated download of whatever `check()` last found available. */
  async download(): Promise<void> {
    if (!this.#ready) {
      this.#fail('Updates are not available in this build.', { action: 'download' });
      return;
    }
    if (this.#status.state !== 'available') {
      // Never return silently: a click that produces no state change and no
      // message is indistinguishable from a broken button, which is the
      // exact failure mode this whole feature keeps running into.
      this.#fail(`Nothing to download (update state: ${this.#status.state}).`, {
        action: 'download',
      });
      return;
    }

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      captureError(error, { phase: 'downloadUpdate' });
      this.#setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Download failed',
      });
    }
  }

  /**
   * Explicit, user-initiated install — quits Kiyro, runs the downloaded
   * installer, relaunches. Only meaningful once a download has actually
   * finished.
   *
   * `quitAndInstall(true, true)`, not the zero-arg call: electron-updater's
   * default is `isSilent: false`, which runs the NSIS installer *without*
   * the `/S` silent flag — a full, visible setup wizard pops up out of
   * nowhere right after someone clicked what looked like a one-click
   * "restart to update" button. That reads as broken, not as an update in
   * progress, and is easy to accidentally cancel. `true, true` runs it
   * silently and relaunches Kiyro on its own once done.
   *
   * That pairing is only sound because `nsis.oneClick` is `true`
   * (package.json). The *assisted* installer (`oneClick: false`) does not
   * reliably honour `--force-run`, and in `/S` mode skips the directory page
   * it was configured to show — so silent-installing one could leave the app
   * quit and never relaunched, or unpacked somewhere the existing shortcut
   * doesn't point at. Both look exactly like "I clicked restart to update
   * and nothing happened." Do not set `oneClick: false` again without also
   * changing this call back to `quitAndInstall(false, true)`.
   */
  async quitAndInstall(): Promise<void> {
    if (this.#status.state !== 'downloaded') {
      this.#fail(`No downloaded update to install (update state: ${this.#status.state}).`, {
        action: 'quitAndInstall',
      });
      return;
    }

    const attemptedVersion = this.#status.version;
    log.info(`[kiyro] installing update ${app.getVersion()} -> ${attemptedVersion}`);
    this.#recordAttempt(attemptedVersion);

    // This process is killed within a tick of `quitAndInstall`, and Sentry
    // delivery is fire-and-forget over the network — anything queued from
    // this session (very much including the reason a *previous* install
    // failed) would go with it otherwise.
    await flushReports();

    autoUpdater.quitAndInstall(true, true);
  }

  /** Path of the marker written before an install attempt — `userData`, same place profiles and preferences live. */
  #attemptFilePath(): string {
    return path.join(app.getPath('userData'), 'update-attempt.json');
  }

  #recordAttempt(attemptedVersion: string): void {
    const attempt: UpdateAttempt = {
      attemptedVersion,
      fromVersion: app.getVersion(),
      at: new Date().toISOString(),
    };
    try {
      // Synchronous on purpose: the installer is spawned and this process
      // quits immediately after, with no event loop turn to spare for a
      // promise to settle in.
      writeFileSync(this.#attemptFilePath(), JSON.stringify(attempt), 'utf-8');
    } catch (error) {
      // Losing the marker costs a diagnostic, not the update itself.
      captureError(error, { phase: 'recordUpdateAttempt', attemptedVersion });
    }
  }

  /**
   * Runs once per launch: did the install we handed off last time actually
   * happen? Reports it if not — this is the check that turns "it just didn't
   * work for him" into a specific version pair and a timestamp.
   */
  #reportPreviousAttempt(): void {
    const file = this.#attemptFilePath();

    let attempt: UpdateAttempt;
    try {
      attempt = JSON.parse(readFileSync(file, 'utf-8')) as UpdateAttempt;
    } catch {
      // No marker (the overwhelmingly common case) or an unreadable one —
      // nothing to conclude either way.
      return;
    }

    try {
      rmSync(file, { force: true });
    } catch {
      // Worst case it's re-reported next launch; not worth failing over.
    }

    const currentVersion = app.getVersion();
    if (currentVersion === attempt.attemptedVersion) {
      log.info(
        `[kiyro] update installed successfully: ${attempt.fromVersion} -> ${currentVersion}`,
      );
      return;
    }

    captureProblem('Update install did not apply', {
      attemptedVersion: attempt.attemptedVersion,
      fromVersion: attempt.fromVersion,
      runningVersion: currentVersion,
      attemptedAt: attempt.at,
      execPath: process.execPath,
    });
  }

  /** Report a refusal the same way a thrown error is reported — logged, sent, and pushed to the UI so the chip can say so. */
  /**
   * A check that couldn't reach GitHub. Never a Sentry event and never a
   * lie: a background check rewinds to whatever the status was before it
   * started (so the UI is exactly as it was, and the next check in a few
   * hours tries again), while a check the user explicitly asked for gets a
   * real answer — "couldn't reach the server" rather than either silence or
   * a false "you're up to date."
   */
  #handleOfflineCheck(error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    log.warn(`[kiyro] update check could not reach GitHub — network unavailable: ${detail}`);

    if (this.#userInitiatedCheck) {
      this.#setStatus({
        state: 'error',
        message: 'Could not reach the update server — check your internet connection.',
      });
      return;
    }

    this.#setStatus(
      this.#statusBeforeCheck.state === 'checking' ? { state: 'idle' } : this.#statusBeforeCheck,
    );
  }

  #fail(message: string, context: Record<string, unknown>): void {
    captureProblem(`Updater: ${message}`, { ...context, status: this.#status.state });
    this.#setStatus({ state: 'error', message });
  }

  #setStatus(status: UpdaterStatusPayload): void {
    this.#status = status;
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(IpcChannel.UpdaterStatus, status);
  }
}
