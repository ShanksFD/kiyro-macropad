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
import type { Preferences } from '../preferences/schema';

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
} as const;

/** One browser found in the registry — see `electron/win-browsers.ts`. */
export interface InstalledBrowser {
  id: string;
  name: string;
  path: string;
  isDefault: boolean;
}

/**
 * Pushed while the shortcut recorder holds an exclusive keyboard capture
 * (`electron/win-keyboard-hook.ts`).
 *
 * `modifiers` is live feedback as they are held down; `captured` arrives once
 * with the finished combination and means capture has already ended;
 * `cancelled` means it ended without one (Escape, or the safety timeout).
 */
export type ShortcutCaptureUpdate =
  | { kind: 'modifiers'; modifiers: string[] }
  | { kind: 'captured'; modifiers: string[]; key: string }
  | { kind: 'cancelled'; reason: 'escape' | 'timeout' };

/**
 * Where a check/download stands, pushed from `electron/updater.ts` whenever
 * it changes and also returned directly by `check()` so a caller doesn't
 * have to race the broadcast to show its own feedback. Never implies a
 * download or install happened on its own — `available`/`downloaded` are
 * things the user has to act on (`download()`/`quitAndInstall()`).
 */
export type UpdaterStatusPayload =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

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
  preferences: {
    get(): Promise<Preferences | null>;
    set(preferences: Preferences): Promise<void>;
  };
  setActiveBindings(payload: SetActiveProfilePayload): Promise<void>;
  /**
   * Frameless-window chrome (the app's own title bar replaces the native
   * one — see `electron/main.ts`'s `titleBarStyle`/`titleBarOverlay`). The
   * OS still draws the actual minimize/maximize/close buttons (Windows
   * overlay) or traffic lights (macOS `hiddenInset`); these just cover what
   * the removed native application menu used to do.
   */
  window: {
    reload(): Promise<void>;
    forceReload(): Promise<void>;
    toggleDevTools(): Promise<void>;
    toggleFullscreen(): Promise<void>;
    showAbout(): Promise<void>;
  };
  apps: {
    /**
     * Native "pick an application" file dialog — the reliable way to bind an
     * exact install location for an `'application'`/`kind: 'path'` action
     * (`src/lib/actions/types.ts`), since every machine installs things
     * somewhere different. Resolves `null` if the user cancels.
     */
    browseForExecutable(): Promise<string | null>;
    /**
     * Browsers actually installed on this machine, read from the registry
     * (`electron/win-browsers.ts`). Empty on non-Windows. The default browser
     * sorts first and is flagged.
     */
    listBrowsers(): Promise<InstalledBrowser[]>;
  };
  /**
   * Exclusive keyboard capture for the shortcut recorder. While `start` is in
   * effect the main process swallows every keystroke system-wide, so
   * combinations Windows would otherwise claim first (Ctrl+Shift+Esc,
   * Alt+Tab, the Windows key) can be recorded. Resolves `false` if capture
   * could not be installed, in which case the caller must fall back to DOM
   * key events.
   */
  shortcutCapture: {
    start(): Promise<boolean>;
    stop(): Promise<void>;
    onUpdate(callback: (payload: ShortcutCaptureUpdate) => void): () => void;
  };
  /** Fired when the main process switches profiles on its own — see the `profile` action. */
  onActiveProfileChanged(callback: (payload: { profileId: string }) => void): () => void;
  /**
   * Manual update flow (`electron/updater.ts`) — checking is passive and
   * runs in the background on its own, but `download`/`quitAndInstall` are
   * only ever called in response to the user clicking something.
   */
  updater: {
    /** Resolves with the resulting status directly, so a caller (e.g. the Help menu's "Check for Updates…") can show immediate feedback without waiting on `onStatus`. */
    check(): Promise<UpdaterStatusPayload>;
    download(): Promise<void>;
    /** Quits Kiyro, installs, relaunches. Only meaningful once `onStatus` has reported `'downloaded'`. */
    quitAndInstall(): Promise<void>;
    onStatus(callback: (payload: UpdaterStatusPayload) => void): () => void;
  };
  /** So the renderer can lay out its own title bar around the OS's caption buttons/traffic lights, which sit on opposite sides. */
  platform: 'win32' | 'darwin' | 'linux';
}
