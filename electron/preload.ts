/**
 * The only file allowed to touch `electron`'s `contextBridge`/`ipcRenderer`.
 *
 * Exposes one typed `window.kiyro` object. The renderer never imports
 * `electron` itself (contextIsolation: true, nodeIntegration: false) — every
 * device/profile call goes through this bridge.
 *
 * Channel names are inlined here (matching `src/lib/electron/ipc-types.ts`'s
 * `IpcChannel` exactly) rather than imported from it, so this file's only
 * runtime dependency is the `electron` module itself — no local-file
 * `require()` for the preload script to fail at silently. Everything else
 * imported below is `import type`, erased entirely at compile time.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  DeviceEventPayload,
  DeviceStatusPayload,
  DiscordStatusPayload,
  ExecutionOutcomePayload,
  InstalledBrowser,
  KiyroBridge,
  SetActiveProfilePayload,
  ShortcutCaptureUpdate,
  StartupStatus,
  UpdaterStatusPayload,
} from '../src/lib/electron/ipc-types';
import type { MacroProfile } from '../src/lib/profiles/types';
import type { Preferences } from '../src/lib/preferences/schema';

const Channel = {
  DeviceStatus: 'kiyro:device-status',
  DeviceEvent: 'kiyro:device-event',
  ExecutionOutcome: 'kiyro:execution-outcome',
  ConnectRequest: 'kiyro:connect-request',
  DisconnectRequest: 'kiyro:disconnect-request',
  SetActiveProfile: 'kiyro:set-active-profile',
  ProfilesList: 'kiyro:profiles:list',
  ProfilesSave: 'kiyro:profiles:save',
  ProfilesDelete: 'kiyro:profiles:delete',
  ProfilesReplaceAll: 'kiyro:profiles:replace-all',
  ProfilesGetActive: 'kiyro:profiles:get-active',
  ProfilesSetActive: 'kiyro:profiles:set-active',
  PreferencesGet: 'kiyro:preferences:get',
  PreferencesSet: 'kiyro:preferences:set',
  WindowReload: 'kiyro:window:reload',
  WindowForceReload: 'kiyro:window:force-reload',
  WindowToggleDevTools: 'kiyro:window:toggle-devtools',
  WindowToggleFullscreen: 'kiyro:window:toggle-fullscreen',
  WindowShowAbout: 'kiyro:window:show-about',
  AppsBrowseExecutable: 'kiyro:apps:browse-executable',
  AppsListBrowsers: 'kiyro:apps:list-browsers',
  ShortcutCaptureStart: 'kiyro:shortcut:capture-start',
  ShortcutCaptureStop: 'kiyro:shortcut:capture-stop',
  ShortcutCaptureUpdate: 'kiyro:shortcut:capture-update',
  ActiveProfileChanged: 'kiyro:profiles:active-changed',
  UpdaterCheck: 'kiyro:updater:check',
  UpdaterDownload: 'kiyro:updater:download',
  UpdaterQuitAndInstall: 'kiyro:updater:quit-and-install',
  UpdaterStatus: 'kiyro:updater:status',
  StartupGet: 'kiyro:startup:get',
  StartupSet: 'kiyro:startup:set',
  DiscordConnect: 'kiyro:discord:connect',
  DiscordDisconnect: 'kiyro:discord:disconnect',
  DiscordStatus: 'kiyro:discord:status',
} as const;

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const kiyroBridge: KiyroBridge = {
  device: {
    connect: (): Promise<void> => ipcRenderer.invoke(Channel.ConnectRequest),
    disconnect: (): Promise<void> => ipcRenderer.invoke(Channel.DisconnectRequest),
    onStatus: (callback: (payload: DeviceStatusPayload) => void) => on(Channel.DeviceStatus, callback),
    onEvent: (callback: (payload: DeviceEventPayload) => void) => on(Channel.DeviceEvent, callback),
    onExecutionOutcome: (callback: (payload: ExecutionOutcomePayload) => void) =>
      on(Channel.ExecutionOutcome, callback),
  },
  profiles: {
    list: (): Promise<MacroProfile[]> => ipcRenderer.invoke(Channel.ProfilesList),
    save: (profile: MacroProfile): Promise<void> => ipcRenderer.invoke(Channel.ProfilesSave, profile),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(Channel.ProfilesDelete, id),
    replaceAll: (profiles: MacroProfile[]): Promise<void> =>
      ipcRenderer.invoke(Channel.ProfilesReplaceAll, profiles),
    getActiveId: (): Promise<string | null> => ipcRenderer.invoke(Channel.ProfilesGetActive),
    setActiveId: (id: string | null): Promise<void> => ipcRenderer.invoke(Channel.ProfilesSetActive, id),
  },
  preferences: {
    get: (): Promise<Preferences | null> => ipcRenderer.invoke(Channel.PreferencesGet),
    set: (preferences: Preferences): Promise<void> => ipcRenderer.invoke(Channel.PreferencesSet, preferences),
  },
  setActiveBindings: (payload: SetActiveProfilePayload): Promise<void> =>
    ipcRenderer.invoke(Channel.SetActiveProfile, payload),
  window: {
    reload: (): Promise<void> => ipcRenderer.invoke(Channel.WindowReload),
    forceReload: (): Promise<void> => ipcRenderer.invoke(Channel.WindowForceReload),
    toggleDevTools: (): Promise<void> => ipcRenderer.invoke(Channel.WindowToggleDevTools),
    toggleFullscreen: (): Promise<void> => ipcRenderer.invoke(Channel.WindowToggleFullscreen),
    showAbout: (): Promise<void> => ipcRenderer.invoke(Channel.WindowShowAbout),
  },
  apps: {
    browseForExecutable: (): Promise<string | null> =>
      ipcRenderer.invoke(Channel.AppsBrowseExecutable),
    listBrowsers: (): Promise<InstalledBrowser[]> => ipcRenderer.invoke(Channel.AppsListBrowsers),
  },
  shortcutCapture: {
    start: (): Promise<boolean> => ipcRenderer.invoke(Channel.ShortcutCaptureStart),
    stop: (): Promise<void> => ipcRenderer.invoke(Channel.ShortcutCaptureStop),
    onUpdate: (callback: (payload: ShortcutCaptureUpdate) => void) =>
      on(Channel.ShortcutCaptureUpdate, callback),
  },
  onActiveProfileChanged: (callback: (payload: { profileId: string }) => void) =>
    on(Channel.ActiveProfileChanged, callback),
  updater: {
    check: (): Promise<UpdaterStatusPayload> => ipcRenderer.invoke(Channel.UpdaterCheck),
    download: (): Promise<void> => ipcRenderer.invoke(Channel.UpdaterDownload),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke(Channel.UpdaterQuitAndInstall),
    onStatus: (callback: (payload: UpdaterStatusPayload) => void) =>
      on(Channel.UpdaterStatus, callback),
  },
  startup: {
    get: (): Promise<StartupStatus> => ipcRenderer.invoke(Channel.StartupGet),
    set: (enabled: boolean): Promise<StartupStatus> =>
      ipcRenderer.invoke(Channel.StartupSet, enabled),
  },
  discord: {
    connect: (): Promise<DiscordStatusPayload> => ipcRenderer.invoke(Channel.DiscordConnect),
    disconnect: (): Promise<void> => ipcRenderer.invoke(Channel.DiscordDisconnect),
    onStatus: (callback: (payload: DiscordStatusPayload) => void) =>
      on(Channel.DiscordStatus, callback),
  },
  platform: process.platform as 'win32' | 'darwin' | 'linux',
};

/**
 * Wires `@sentry/electron/renderer`'s IPC transport up to
 * `electron/observability.ts`'s main-process client, so renderer-side
 * errors report through the same Sentry project instead of nowhere.
 *
 * This is a hand-written equivalent of `@sentry/electron/preload`'s own
 * `hookupIpc()` (verified against its source, `node_modules/@sentry/electron/
 * preload/default.js` — ~20 lines, one trivial string-formatting helper),
 * not a shortcut around it. Electron's preload scripts run through a
 * restricted internal loader that does not resolve `node_modules` package
 * *subpath* exports (`@sentry/electron/preload`, as opposed to the bare
 * `@sentry/electron`) — `import '@sentry/electron/preload'` throws
 * `module not found` at the top of this file before anything below it runs,
 * which previously took `window.kiyro` down with it: every feature in the
 * app, not just crash reporting. Inlining keeps this file's only runtime
 * dependency `electron` itself, per its own doc comment above — the same
 * property that already makes this file safe from a `require()` of a local
 * project file failing silently.
 *
 * `'sentry-ipc'` matches `@sentry/electron`'s own default
 * `ipcNamespace` (`main/sdk.js`) — `observability.ts` doesn't override it,
 * so this must not either.
 */
function hookupSentryIpc(namespace = 'sentry-ipc'): void {
  const globalWindow = window as typeof window & {
    __SENTRY_IPC__?: Record<string, unknown>;
  };
  globalWindow.__SENTRY_IPC__ = globalWindow.__SENTRY_IPC__ ?? {};
  if (globalWindow.__SENTRY_IPC__[namespace]) return;

  const createKey = (channel: string) => `${namespace}.${channel}`;
  const ipcObject = {
    sendRendererStart: () => ipcRenderer.send(createKey('start')),
    sendScope: (scopeJson: string) => ipcRenderer.send(createKey('scope'), scopeJson),
    sendEnvelope: (envelope: unknown) => ipcRenderer.send(createKey('envelope'), envelope),
    sendStatus: (status: unknown) => ipcRenderer.send(createKey('status'), status),
    sendStructuredLog: (log: unknown) => ipcRenderer.send(createKey('structured-log'), log),
    sendMetric: (metric: unknown) => ipcRenderer.send(createKey('metric'), metric),
  };
  globalWindow.__SENTRY_IPC__[namespace] = ipcObject;

  // contextIsolation is always on in this app (`electron/main.ts`), so this
  // branch is the only one ever reached — matched to the upstream
  // implementation's own defensive check regardless.
  if (contextBridge) {
    try {
      contextBridge.exposeInMainWorld('__SENTRY_IPC__', globalWindow.__SENTRY_IPC__);
    } catch (error) {
      console.error('[kiyro] preload: failed to expose Sentry IPC bridge', error);
    }
  }
}

// `window.kiyro` is what the entire renderer depends on to know it's even
// running inside Electron (`useKiyroBridge`) — it must go out regardless of
// whether the Sentry wiring below it succeeds. Each step gets its own
// try/catch instead of one wrapping both, so a Sentry-side failure can never
// take `window.kiyro` down with it again.
try {
  contextBridge.exposeInMainWorld('kiyro', kiyroBridge);
  console.log('[kiyro] preload: window.kiyro exposed');
} catch (error) {
  // Printed to the renderer's DevTools console (View -> Toggle Developer
  // Tools) — a preload crash never reaches the main process's terminal.
  console.error('[kiyro] preload: failed to expose window.kiyro', error);
}

try {
  hookupSentryIpc();
} catch (error) {
  console.error('[kiyro] preload: failed to set up Sentry IPC bridge', error);
}
