/**
 * Registers every IPC handler the preload bridge (`preload.ts`) calls into.
 * The renderer never sees these channel names directly — only `window.kiyro`.
 */

import { ipcMain } from 'electron';
import { IpcChannel } from '../src/lib/electron/ipc-types';
import type { SetActiveProfilePayload } from '../src/lib/electron/ipc-types';
import type { MacroProfile } from '../src/lib/profiles/types';
import type { Preferences } from '../src/lib/preferences/schema';
import { electronProfileStorage } from './profile-storage';
import { electronPreferencesStorage } from './preferences-storage';
import type { ExecutionPipeline } from './execution-pipeline';

export function registerIpcHandlers(pipeline: ExecutionPipeline): void {
  console.log('[kiyro][diag] IPC handlers registered');

  ipcMain.handle(IpcChannel.ConnectRequest, () => {
    console.log('[kiyro] connect requested');
    pipeline.start();
  });

  // Answers "what is the connection state right now?" — see
  // `ExecutionPipeline.deviceStatus`. Without this the renderer only ever
  // learns about *changes*, so a window recreated from the tray came up
  // claiming no macro pad was connected while the pad went on working.
  ipcMain.handle(IpcChannel.DeviceGetStatus, () => pipeline.deviceStatus);

  ipcMain.handle(IpcChannel.DisconnectRequest, () => {
    console.log('[kiyro] disconnect requested');
    pipeline.stop();
  });

  ipcMain.handle(IpcChannel.SetActiveProfile, (_event, payload: SetActiveProfilePayload) => {
    console.log(
      `[kiyro][diag] IPC ${IpcChannel.SetActiveProfile} received: profileId=${payload.profileId} updatedAt=${payload.updatedAt} bindingKeys=[${Object.keys(payload.bindings).join(', ')}]`,
    );
    pipeline.setActiveProfile(payload);
  });

  ipcMain.handle(IpcChannel.ProfilesList, () => electronProfileStorage.list());
  ipcMain.handle(IpcChannel.ProfilesSave, (_event, profile: MacroProfile) => electronProfileStorage.save(profile));
  ipcMain.handle(IpcChannel.ProfilesDelete, (_event, id: string) => electronProfileStorage.delete(id));
  ipcMain.handle(IpcChannel.ProfilesReplaceAll, (_event, profiles: MacroProfile[]) =>
    electronProfileStorage.replaceAll(profiles),
  );
  ipcMain.handle(IpcChannel.ProfilesGetActive, () => electronProfileStorage.getActiveProfileId());
  ipcMain.handle(IpcChannel.ProfilesSetActive, (_event, id: string | null) =>
    electronProfileStorage.setActiveProfileId(id),
  );

  ipcMain.handle(IpcChannel.PreferencesGet, () => electronPreferencesStorage.get());
  ipcMain.handle(IpcChannel.PreferencesSet, (_event, preferences: Preferences) =>
    electronPreferencesStorage.set(preferences),
  );
}
