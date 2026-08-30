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
  // TEMP DIAGNOSTIC: anchors every other timestamped log against "IPC is
  // wired up" — this always runs inside `app.whenReady()`, before
  // `createWindow()`/`loadURL` even starts, so it should be the very first
  // `[kiyro]` line every launch.
  console.log('[kiyro][diag] IPC handlers registered');

  ipcMain.handle(IpcChannel.ConnectRequest, () => {
    console.log('[kiyro] connect requested');
    pipeline.start();
  });

  ipcMain.handle(IpcChannel.DisconnectRequest, () => {
    console.log('[kiyro] disconnect requested');
    pipeline.stop();
  });

  ipcMain.handle(IpcChannel.SetActiveProfile, (_event, payload: SetActiveProfilePayload) => {
    // TEMP DIAGNOSTIC: confirms the IPC call actually arrived at main, as
    // opposed to never being sent (or being sent and silently rejected)
    // from the renderer.
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
