// Relative imports (not the `@/*` alias): this file is compiled twice — once
// by webpack for the renderer, once by plain `tsc` for Electron's main
// process — and only relative paths resolve at runtime for the latter.
import type { Action, BindingMap } from '../actions/types';
import type { PortInfo } from '../serial/transport';
import type { ConnectionStatus } from '../serial/device-session';
import type { DeviceEvent } from '../protocol/types';
import type { EventResolution } from '../devices/types';
import type { ExecutionOutcome } from '../execution/executor';
import type { MacroProfile } from '../profiles/types';

/**
 * The IPC contract between Electron's main process and Kiyro's renderer.
 *
 * Framework-free (no Electron, no DOM, no React) so both `electron/*.ts` (main,
 * Node) and `src/**` (renderer) can import it unchanged. Naming the channels
 * here, rather than typing them by hand at each call site, keeps main and
 * preload/renderer from drifting apart.
 */
export const IpcChannel = {
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

/** Pushed from main whenever the real serial connection's state changes. */
export interface DeviceStatusPayload {
  status: ConnectionStatus;
  deviceId: string | null;
  portInfo: PortInfo | null;
  error: string | null;
  latencyMs: number | null;
}

/** Pushed from main after every input event, purely for UI mirroring. */
export interface DeviceEventPayload {
  event: DeviceEvent;
  resolution: EventResolution;
  at: number;
}

/** Pushed from main after every native execution attempt, purely for UI mirroring. */
export interface ExecutionOutcomePayload {
  controlId: string;
  action: Action;
  outcome: ExecutionOutcome;
  at: number;
}

/** Sent from the renderer whenever the active profile or its bindings change. */
export interface SetActiveProfilePayload {
  profileId: string;
  updatedAt: string;
  bindings: BindingMap;
}

/**
 * The shape `electron/preload.ts` exposes as `window.kiyro`. Declared here so
 * both preload (which builds it) and the renderer (which only ever sees it
 * through `window.kiyro`, see `src/types/electron.d.ts`) agree on its shape.
 */
export interface KiyroBridge {
  device: {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    onStatus(callback: (payload: DeviceStatusPayload) => void): () => void;
    onEvent(callback: (payload: DeviceEventPayload) => void): () => void;
    onExecutionOutcome(callback: (payload: ExecutionOutcomePayload) => void): () => void;
  };
  profiles: {
    list(): Promise<MacroProfile[]>;
    save(profile: MacroProfile): Promise<void>;
    delete(id: string): Promise<void>;
    replaceAll(profiles: MacroProfile[]): Promise<void>;
    getActiveId(): Promise<string | null>;
    setActiveId(id: string | null): Promise<void>;
  };
  setActiveBindings(payload: SetActiveProfilePayload): Promise<void>;
}
