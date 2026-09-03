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

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol } from 'electron';
import type { Tray } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildMacAppMenu, showAboutDialog } from './menu';
import { createTray, setTrayConnected } from './tray';
import { ExecutionPipeline } from './execution-pipeline';
import { registerIpcHandlers } from './ipc-handlers';
import { AppUpdater } from './updater';
import { listInstalledBrowsers } from './win-browsers';
import * as keyboardCapture from './win-keyboard-hook';
import { IpcChannel } from '../src/lib/electron/ipc-types';
import type { ShortcutCaptureUpdate } from '../src/lib/electron/ipc-types';

// Straight to Configure — there's no separate home/landing page (see the
// packaged-build branch of `createWindow()` below for the full reasoning).
const DEV_SERVER_URL = 'http://localhost:3000/configure';
const APP_SCHEME = 'app';
const OUT_DIR = path.join(__dirname, '../../out');
const ASSETS_DIR = path.join(__dirname, '../../electron/assets');

// Only actually applies on Windows/Linux — Electron ignores `BrowserWindow`'s
// `icon` option on macOS (the dock icon comes from the app bundle's .icns at
// package time instead, via `app.dock.setIcon` below for dev mode). This is
// what makes the window/taskbar icon correct in `electron:dev` too, not just
// in a packaged build — electron-builder's `win.icon` config (package.json)
// only ever applies to the packaged `Kiyro.exe`, never to the stock
// `electron.exe` binary dev mode runs directly.
const WINDOW_ICON_PATH = path.join(ASSETS_DIR, 'icon.ico');

/**
 * Must match `build.appId` (package.json) exactly. Windows groups toast
 * notifications (`electron/execution-pipeline.ts`'s profile-switch toast) by
 * this id — without it every notification comes from Electron's own default
 * id and shows up branded "Electron" with Electron's icon, not "Kiyro"
 * with Kiyro's, regardless of what `icon:`/`title:` the `Notification` call
 * itself sets. Also needs to be set before `app.whenReady()`, not after.
 */
const APP_USER_MODEL_ID = 'com.kiyro.macropad';

/** The app's own in-page title bar height — must match `layout.windowTitleBarHeight` (`src/theme/tokens.ts`), which is what the Windows caption-button overlay gets sized to below. */
const TITLE_BAR_HEIGHT = 36;

/**
 * Kiyro is dark-only (`theme/theme.ts` — no light scheme, no toggle), so
 * this is set once at window creation and never touched again — matches
 * `background.paper`/`text.primary` (`palette.neutral[900]`/`[100]`,
 * `src/theme/tokens.ts`), the in-page title bar's own background.
 */
const DEFAULT_TITLE_BAR_OVERLAY = {
  color: '#111419',
  symbolColor: '#EAEDF1',
};

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
    icon: WINDOW_ICON_PATH,
    // Painted immediately at window creation, before the page has loaded
    // anything — without this Electron defaults to white, which can flash
    // or show as a mismatched seam right behind/around the caption-button
    // area for a frame or two on a dark start.
    backgroundColor: DEFAULT_TITLE_BAR_OVERLAY.color,
    // Frameless: the OS's own title bar/menu bar is replaced by the app's
    // own in-page one (`src/components/layout/window-title-bar.tsx` +
    // `window-menu.tsx`), matching VSCode's look. The OS still draws the
    // real caption buttons/traffic lights — we're not reimplementing those,
    // just relocating and re-theming the strip around them.
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          // Vertically centers the traffic lights in `TITLE_BAR_HEIGHT`
          // (default position assumes a much shorter native title bar).
          trafficLightPosition: { x: 14, y: (TITLE_BAR_HEIGHT - 16) / 2 },
        }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { ...DEFAULT_TITLE_BAR_OVERLAY, height: TITLE_BAR_HEIGHT },
        }),
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
    keyboardCapture.stopCapture();
  });

  // Belt-and-braces for the shortcut recorder's exclusive keyboard capture:
  // it swallows every keystroke on the machine while active, so it must not
  // be able to outlive the window that asked for it. Its own timeout already
  // covers a renderer that never calls stop; these cover a window that goes
  // away or loses focus mid-capture.
  window.on('blur', () => keyboardCapture.stopCapture());
  window.on('hide', () => keyboardCapture.stopCapture());

  // The default menu's File/Edit/Window entries are meant for a document
  // editor and mean nothing here (see menu.ts); its page-zoom shortcuts
  // (Ctrl+/Ctrl-/Ctrl+0) don't belong in this app either. Zoom level is also
  // persisted per-origin by Chromium across restarts (it lives in this
  // profile's storage, not the page) — an earlier zoom-in before this was
  // disabled stays "stuck" unless reset explicitly here, every load.
  window.webContents.on('did-finish-load', () => {
    window.webContents.setZoomFactor(1);
    window.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
    console.log('[kiyro][diag] did-finish-load fired');
  });

  if (app.isPackaged) {
    // Straight to Configure — there's no separate home/landing page
    // (`src/app/page.tsx` just redirects here too, for the rare direct
    // browser visit outside Electron); this skips that hop entirely.
    await window.loadURL(`${APP_SCHEME}://kiyro/configure.html`);
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
  if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);

  app.on('second-instance', () => {
    // Another launch attempt happened while we're already running — surface
    // our window instead of letting a second process fight us for the port.
    if (mainWindow) showWindow();
    else void createWindow();
  });

  app.whenReady().then(() => {
    // Dev mode on macOS runs the stock Electron binary, which has no dock
    // icon of its own — a packaged build gets this for free from the
    // bundled `.icns` (`build.mac.icon`, package.json) instead.
    if (process.platform === 'darwin' && !app.isPackaged) {
      const dockIcon = nativeImage.createFromPath(path.join(ASSETS_DIR, 'icon.icns'));
      if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon);
    }

    // Only ever hit for a packaged build (`app://kiyro/...`, per `loadURL`
    // above) — dev mode loads `http://localhost:3000` directly and never
    // touches this handler.
    protocol.handle(APP_SCHEME, (request) => {
      const url = new URL(request.url);
      const filePath = path.join(OUT_DIR, resolveOutPath(url.pathname));
      return net.fetch(pathToFileURL(filePath).toString());
    });

    // No visible menu bar at all on Windows/Linux (the in-page one covers
    // View/Help); macOS keeps the bare minimum its system menu bar needs —
    // see `menu.ts`.
    Menu.setApplicationMenu(process.platform === 'darwin' ? buildMacAppMenu() : null);

    // Backs the in-page title bar's View/Help menu (`window-menu.tsx`) —
    // these replace what the native application menu used to do, now that
    // it's gone (see above). Registered here rather than in
    // `ipc-handlers.ts` since these are window/app-chrome concerns, not
    // device/profile ones.
    ipcMain.handle(IpcChannel.WindowReload, () => mainWindow?.webContents.reload());
    ipcMain.handle(IpcChannel.WindowForceReload, () =>
      mainWindow?.webContents.reloadIgnoringCache(),
    );
    ipcMain.handle(IpcChannel.WindowToggleDevTools, () => mainWindow?.webContents.toggleDevTools());
    ipcMain.handle(IpcChannel.WindowToggleFullscreen, () => {
      if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
    });
    ipcMain.handle(IpcChannel.WindowShowAbout, () => showAboutDialog());

    // Backs the "Browse…" button in the Application action form
    // (`action-forms.tsx`) — the only reliable way to bind an exact install
    // location, since every machine installs things somewhere different.
    ipcMain.handle(IpcChannel.AppsBrowseExecutable, async () => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose an application',
        properties: ['openFile'],
        filters:
          process.platform === 'win32'
            ? [
                { name: 'Applications', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
                { name: 'All files', extensions: ['*'] },
              ]
            : [{ name: 'All files', extensions: ['*'] }],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    });

    ipcMain.handle(IpcChannel.AppsListBrowsers, () => listInstalledBrowsers());

    // Exclusive keyboard capture for the shortcut recorder. Every update is
    // sent with `setImmediate` because these originate *inside* a low-level
    // keyboard hook callback, which Windows discards entirely if it runs
    // long — see the safety notes in `win-keyboard-hook.ts`.
    const sendCaptureUpdate = (payload: ShortcutCaptureUpdate) => {
      setImmediate(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IpcChannel.ShortcutCaptureUpdate, payload);
        }
      });
    };

    ipcMain.handle(IpcChannel.ShortcutCaptureStart, () =>
      keyboardCapture.startCapture({
        onModifiers: (modifiers) => sendCaptureUpdate({ kind: 'modifiers', modifiers }),
        onCapture: ({ modifiers, key }) => sendCaptureUpdate({ kind: 'captured', modifiers, key }),
        onCancel: (reason) => sendCaptureUpdate({ kind: 'cancelled', reason }),
      }),
    );

    ipcMain.handle(IpcChannel.ShortcutCaptureStop, () => keyboardCapture.stopCapture());

    const pipeline = new ExecutionPipeline(() => mainWindow);
    registerIpcHandlers(pipeline);
    void createWindow();

    const updater = new AppUpdater(() => mainWindow);
    updater.init();
    ipcMain.handle(IpcChannel.UpdaterCheck, () => updater.check());
    ipcMain.handle(IpcChannel.UpdaterDownload, () => updater.download());
    ipcMain.handle(IpcChannel.UpdaterQuitAndInstall, () => updater.quitAndInstall());

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
      keyboardCapture.stopCapture();
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
