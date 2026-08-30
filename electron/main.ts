/**
 * Electron entry point.
 *
 * Dev mode loads the live `next dev` server (`http://localhost:3000`) so the
 * usual Next.js hot-reload workflow keeps working — `npm run electron:dev`
 * starts both together and waits for the server before launching this.
 *
 * A packaged build would instead load the static export
 * (`next.config.ts`'s `output: 'export'`) from `out/index.html` via
 * `file://` — that branch is written but not exercised here; packaging
 * itself is out of scope for this pass.
 *
 * Background/tray mode: the macro pad must keep working with no window
 * open, since the main process — not the window — owns the serial
 * connection and does the actual key injection (see `execution-pipeline.ts`).
 * So closing the window (the `X` button) hides it rather than quitting the
 * app; only the tray's "Quit Kiyro" (or an OS-level quit) actually tears
 * everything down. `isQuitting` is what tells the window's `close` handler
 * which of those is happening.
 */

import { app, BrowserWindow, Menu } from 'electron';
import type { Tray } from 'electron';
import path from 'node:path';
import { buildAppMenu } from './menu';
import { createTray } from './tray';
import { ExecutionPipeline } from './execution-pipeline';
import { registerIpcHandlers } from './ipc-handlers';

const DEV_SERVER_URL = 'http://localhost:3000';

/** Passed by a launcher (e.g. a "start with Windows" login item) that wants Kiyro running without the GUI popping up. */
const START_HIDDEN = process.argv.includes('--hidden');

let mainWindow: BrowserWindow | null = null;
// Held for the app's whole lifetime: an unreferenced `Tray` is liable to be
// garbage-collected, at which point its icon silently vanishes.
let tray: Tray | null = null;
let isQuitting = false;

async function loadDevServer(window: BrowserWindow): Promise<void> {
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await window.loadURL(DEV_SERVER_URL);
      return;
    } catch {
      if (attempt === 0) {
        console.log(`[kiyro] waiting for ${DEV_SERVER_URL} (run "next dev" alongside this)...`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  console.error(`[kiyro] could not reach ${DEV_SERVER_URL} after ${maxAttempts} attempts`);
}

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    // Created hidden either way, so a `--hidden` launch never flashes a
    // window; the normal path shows it once the page has actually painted
    // (`ready-to-show`), same as if `show` had been left at its default.
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Not `sandbox: true`: a sandboxed preload script's `require()` of
      // local project files (as opposed to built-in/`node_modules` ones) is
      // unreliable across Electron versions and can fail silently on the
      // renderer side, with nothing printed to this process's console —
      // `window.kiyro` then just never appears, and the UI falls back to a
      // dead Web Serial path with no visible error at all. contextIsolation
      // + nodeIntegration: false already keep the renderer off Node/Electron
      // directly; only the explicit `window.kiyro` bridge crosses that line.
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow = window;

  window.once('ready-to-show', () => {
    if (!START_HIDDEN) window.show();
  });

  // The `X` button hides the window instead of destroying it — the serial
  // connection and execution pipeline live in this process, not the window,
  // and must keep running. Only an actual quit (`isQuitting`, set by the
  // tray's "Quit Kiyro" or `before-quit`) lets the close proceed for real.
  window.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    window.hide();
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  // The default menu's File/Edit/Window entries are meant for a document
  // editor and mean nothing here (see menu.ts); its page-zoom shortcuts
  // (Ctrl+/Ctrl-/Ctrl+0) don't belong in this app either. Zoom level is also
  // persisted per-origin by Chromium across restarts (it lives in this
  // profile's storage, not the page) — an earlier zoom-in before this was
  // disabled stays "stuck" unless reset explicitly here, every load.
  window.webContents.on('did-finish-load', () => {
    window.webContents.setZoomFactor(1);
    window.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
    // TEMP DIAGNOSTIC (kept from the persistence investigation, not yet
    // removed): timestamp anchor for "the page (and therefore preload) just
    // (re)loaded".
    console.log('[kiyro][diag] did-finish-load fired');
  });

  if (app.isPackaged) {
    await window.loadFile(path.join(__dirname, '../../out/index.html'));
  } else {
    await loadDevServer(window);
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildAppMenu());

  const pipeline = new ExecutionPipeline(() => mainWindow);
  registerIpcHandlers(pipeline);
  void createWindow();

  tray = createTray({
    onOpen: () => {
      if (mainWindow) showWindow();
      else void createWindow();
    },
    onQuit: () => {
      console.log('[kiyro] quitting (tray)');
      isQuitting = true;
      app.quit();
    },
  });

  app.on('activate', () => {
    // macOS convention: clicking the dock icon reopens the window even
    // though the app (and its tray icon) stayed running while hidden.
    if (mainWindow) showWindow();
    else void createWindow();
  });

  // Covers every path to quitting, not just the tray's — an OS-level quit
  // (shutdown, Cmd+Q, task manager "End task" going through a clean exit)
  // must also let the window actually close instead of just hiding.
  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    // Reached only once a real quit already tore the window down (hiding it
    // never fires this) — the pipeline shutting down here, redundantly with
    // the tray's own `onQuit`, is what guarantees COM3 is released however
    // the app happened to exit.
    pipeline.stop();
    if (process.platform !== 'darwin') app.quit();
  });
});
