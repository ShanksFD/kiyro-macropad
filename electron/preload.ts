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
  ExecutionOutcomePayload,
  InstalledBrowser,
  KiyroBridge,
  SetActiveProfilePayload,
  ShortcutCaptureUpdate,
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
  platform: process.platform as 'win32' | 'darwin' | 'linux',
};

try {
  contextBridge.exposeInMainWorld('kiyro', kiyroBridge);
  console.log('[kiyro] preload: window.kiyro exposed');
} catch (error) {
  // Printed to the renderer's DevTools console (View -> Toggle Developer
  // Tools) — a preload crash never reaches the main process's terminal.
  console.error('[kiyro] preload: failed to expose window.kiyro', error);
}
