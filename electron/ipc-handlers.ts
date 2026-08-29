/**
 * Registers every IPC handler the preload bridge (`preload.ts`) calls into.
 * The renderer never sees these channel names directly — only `window.kiyro`.
 */

import { ipcMain } from 'electron';
import { IpcChannel } from '../src/lib/electron/ipc-types';
import type { SetActiveProfilePayload } from '../src/lib/electron/ipc-types';
import type { MacroProfile } from '../src/lib/profiles/types';
import { electronProfileStorage } from './profile-storage';
import type { ExecutionPipeline } from './execution-pipeline';

export function registerIpcHandlers(pipeline: ExecutionPipeline): void {
  ipcMain.handle(IpcChannel.ConnectRequest, () => {
    console.log('[kiyro] connect requested');
    pipeline.start();
  });

  ipcMain.handle(IpcChannel.DisconnectRequest, () => {
    console.log('[kiyro] disconnect requested');
    pipeline.stop();
  });

  ipcMain.handle(IpcChannel.SetActiveProfile, (_event, payload: SetActiveProfilePayload) => {
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
}
