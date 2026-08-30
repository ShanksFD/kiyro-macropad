/**
 * Electron entry point.
 *
 * Dev mode loads the live `next dev` server (`http://localhost:3000`) so the
 * usual Next.js hot-reload workflow keeps working — `npm run electron:dev`
 * starts both together and waits for the server before launching this.
 *
 * A packaged build loads the static export (`next.config.ts`'s
 * `output: 'export'`) through a custom `app://` protocol registered below —
 * NOT `file://`. Next's static export always emits root-absolute asset URLs
 * (`/_next/static/...` for every JS/CSS/font file, regardless of
 * `assetPrefix`), which resolve fine over `http://` but break under
 * `file://`, where a root-absolute path means the OS filesystem root, not
 * the site root — e.g. `C:\_next\static\...` instead of `out\_next\static\...`.
 * The symptom is a silent, mostly-invisible failure: every asset 404s, but
 * the browser just falls back to system fonts / unstyled content instead of
 * erroring loudly, so this is easy to miss without actually testing a
 * packaged build. `app://` sidesteps it entirely by mapping every request's
 * pathname onto a file under `out/` ourselves, so `/_next/...` resolves
 * against `out/_next/...` correctly.
 *
 * Background/tray mode: the macro pad must keep working with no window
 * open, since the main process — not the window — owns the serial
 * connection and does the actual key injection (see `execution-pipeline.ts`).
 * So closing the window (the `X` button) hides it rather than quitting the
 * app; only the tray's "Quit Kiyro" (or an OS-level quit) actually tears
 * everything down. `isQuitting` is what tells the window's `close` handler
 * which of those is happening.
 *
 * Single instance: hide-instead-of-quit makes it easy to forget an old
 * instance is still alive in the tray and launch a second one on top of it.
 * Two instances both opening the same COM port is fatal — Windows serial
 * ports are exclusive, so the second instance's connect attempts just fail
 * as "busy" forever, retrying every couple seconds. `requestSingleInstanceLock`
 * below prevents that: a second launch quits itself immediately and asks the
 * first instance to show its window instead.
 */

import { app, BrowserWindow, Menu, net, protocol } from 'electron';
import type { Tray } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAppMenu } from './menu';
import { createTray, setTrayConnected } from './tray';
import { ExecutionPipeline } from './execution-pipeline';
import { registerIpcHandlers } from './ipc-handlers';

const DEV_SERVER_URL = 'http://localhost:3000';
const APP_SCHEME = 'app';
const OUT_DIR = path.join(__dirname, '../../out');

// Must be called before `app` is ready. `standard: true` is what makes
// root-absolute paths (`/_next/...`) resolve against this scheme's origin
// instead of erroring — the same behaviour `http://` gives Next's static
// export for free.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

/**
 * Maps a request pathname onto a file in `out/`. The static export writes
 * each route as a flat `<route>.html` (e.g. `out/configure.html`, not
 * `out/configure/index.html` — see `next.config.ts`, `trailingSlash` is
 * left at its default `false`), and asset paths already carry a real
 * extension, so only extension-less pathnames need `.html` appended.
 */
function resolveOutPath(pathname: string): string {
  const decoded = decodeURIComponent(pathname);
  if (decoded === '/' || decoded === '') return 'index.html';
  const trimmed = decoded.replace(/^\/+/, '');
  const lastSegment = trimmed.split('/').pop() ?? '';
  return lastSegment.includes('.') ? trimmed : `${trimmed}.html`;
}

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
    await window.loadURL(`${APP_SCHEME}://kiyro/index.html`);
  } else {
    await loadDevServer(window);
  }
}

// Must run before anything touches the serial port. If another instance
// already holds the lock, this call returns false and we quit immediately —
// none of the code below (which opens COM3) ever runs for this process.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Another launch attempt happened while we're already running — surface
    // our window instead of letting a second process fight us for the port.
    if (mainWindow) showWindow();
    else void createWindow();
  });

  app.whenReady().then(() => {
    // Only ever hit for a packaged build (`app://kiyro/...`, per `loadURL`
    // above) — dev mode loads `http://localhost:3000` directly and never
    // touches this handler.
    protocol.handle(APP_SCHEME, (request) => {
      const url = new URL(request.url);
      const filePath = path.join(OUT_DIR, resolveOutPath(url.pathname));
      return net.fetch(pathToFileURL(filePath).toString());
    });

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

    // Keep the tray icon reflecting live connection state, so it's visible
    // without opening the window at all — relevant given how often COM3 has
    // been dropping in this environment.
    pipeline.bridge.onStateChange((state) => {
      if (tray) setTrayConnected(tray, state.status === 'connected');
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
}
