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
 */

import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IpcChannel } from '../src/lib/electron/ipc-types';
import type { UpdaterStatusPayload } from '../src/lib/electron/ipc-types';
import { UPDATE_FEED_TOKEN } from './update-token';

/** Background re-check cadence — Kiyro is meant to keep running in the tray for long stretches between restarts, so launch alone isn't enough. Never triggers a download by itself. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export class AppUpdater {
  #ready = false;
  #status: UpdaterStatusPayload = { state: 'idle' };

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  /** Wires up the feed and starts background checking. Safe to call unconditionally — no-ops in dev or when this build has no runtime token baked in, rather than failing loudly either way. */
  init(): void {
    if (!app.isPackaged) {
      console.log('[kiyro] auto-update disabled: not a packaged build');
      return;
    }

    if (UPDATE_FEED_TOKEN === '') {
      console.warn(
        '[kiyro] auto-update disabled: this build has no KIYRO_UPDATE_TOKEN baked in (see README.md)',
      );
      return;
    }

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

    autoUpdater.on('checking-for-update', () => this.#setStatus({ state: 'checking' }));
    autoUpdater.on('update-available', (info) =>
      this.#setStatus({ state: 'available', version: info.version }),
    );
    autoUpdater.on('update-not-available', () => this.#setStatus({ state: 'not-available' }));
    autoUpdater.on('download-progress', (progress) =>
      this.#setStatus({ state: 'downloading', percent: Math.round(progress.percent) }),
    );
    autoUpdater.on('update-downloaded', (info) =>
      this.#setStatus({ state: 'downloaded', version: info.version }),
    );
    autoUpdater.on('error', (error) => {
      console.error('[kiyro] auto-update error:', error);
      this.#setStatus({ state: 'error', message: error.message });
    });

    this.#ready = true;
    this.check();
    setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  /** Read-only: asks GitHub what the latest release is. Never downloads anything by itself. Returns the resulting status so a caller (the Help menu's "Check for Updates…") can show its own immediate feedback instead of racing the broadcast channel. */
  async check(): Promise<UpdaterStatusPayload> {
    if (!this.#ready) return this.#status;

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      // Already turned into an `error` status by the `'error'` listener
      // above in the normal case; this only catches a check that failed
      // before electron-updater got far enough to emit that event at all.
      console.error('[kiyro] checkForUpdates failed:', error);
    }

    return this.#status;
  }

  /** Explicit, user-initiated download of whatever `check()` last found available. */
  async download(): Promise<void> {
    if (!this.#ready || this.#status.state !== 'available') return;

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('[kiyro] downloadUpdate failed:', error);
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
   * the `/S` silent flag — a full, visible setup wizard (license screen,
   * directory picker, Next/Install buttons) pops up out of nowhere right
   * after someone clicked what looked like a one-click "restart to update"
   * button. That reads as broken, not as an update in progress, and is easy
   * to accidentally cancel. `true, true` runs it silently and relaunches
   * Kiyro on its own once done — no dialog, no click-through, matching what
   * the button actually promised.
   */
  quitAndInstall(): void {
    if (this.#status.state !== 'downloaded') return;
    autoUpdater.quitAndInstall(true, true);
  }

  #setStatus(status: UpdaterStatusPayload): void {
    this.#status = status;
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(IpcChannel.UpdaterStatus, status);
  }
}
