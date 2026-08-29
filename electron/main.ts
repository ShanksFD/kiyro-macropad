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
 */

import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { buildAppMenu } from './menu';
import { ExecutionPipeline } from './execution-pipeline';
import { registerIpcHandlers } from './ipc-handlers';

const DEV_SERVER_URL = 'http://localhost:3000';

let mainWindow: BrowserWindow | null = null;

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

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });

  app.on('window-all-closed', () => {
    pipeline.stop();
    if (process.platform !== 'darwin') app.quit();
  });
});
