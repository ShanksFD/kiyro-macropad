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
  KiyroBridge,
  SetActiveProfilePayload,
} from '../src/lib/electron/ipc-types';
import type { MacroProfile } from '../src/lib/profiles/types';

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
  setActiveBindings: (payload: SetActiveProfilePayload): Promise<void> =>
    ipcRenderer.invoke(Channel.SetActiveProfile, payload),
};

try {
  contextBridge.exposeInMainWorld('kiyro', kiyroBridge);
  console.log('[kiyro] preload: window.kiyro exposed');
} catch (error) {
  // Printed to the renderer's DevTools console (View -> Toggle Developer
  // Tools) — a preload crash never reaches the main process's terminal.
  console.error('[kiyro] preload: failed to expose window.kiyro', error);
}
