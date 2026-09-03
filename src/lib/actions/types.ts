import type { Modifier } from './keys';

export const MEDIA_COMMANDS = ['playPause', 'next', 'previous', 'stop'] as const;
export type MediaCommand = (typeof MEDIA_COMMANDS)[number];

export const VOLUME_COMMANDS = ['up', 'down', 'mute'] as const;
export type VolumeCommand = (typeof VOLUME_COMMANDS)[number];

export const SCROLL_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type ScrollDirection = (typeof SCROLL_DIRECTIONS)[number];

export const MOUSE_BUTTONS = ['left', 'right', 'middle'] as const;
export type MouseButton = (typeof MOUSE_BUTTONS)[number];

/**
 * `screenshot` is the *region* capture (Win+Shift+S — Snipping Tool's
 * overlay), not a full-screen grab. On a multi-monitor setup a full-screen
 * capture is almost never what someone wants from a macro key: it silently
 * grabs every display into one oversized image. `screenshotFull` keeps the
 * old behaviour for anyone who does want it.
 *
 * Order here is the order the picker lists them in, so the everyday ones come
 * first and the three irreversible ones (`signOut`/`restart`/`shutDown`) sit
 * together at the end.
 */
export const SYSTEM_COMMANDS = [
  'lock',
  'sleep',
  'displayOff',
  'screenshot',
  'screenshotFull',
  'taskManager',
  'fileExplorer',
  'settings',
  'showDesktop',
  'signOut',
  'restart',
  'shutDown',
] as const;
export type SystemCommand = (typeof SYSTEM_COMMANDS)[number];

export const PROFILE_COMMANDS = ['next', 'previous'] as const;
export type ProfileCommand = (typeof PROFILE_COMMANDS)[number];

/**
 * Voice controls over Discord's own local IPC connection
 * (`electron/discord-rpc.ts`) — not a synthesized keystroke, a real command
 * to whatever Discord account is signed in on this machine. `toggleMute` and
 * `toggleDeafen` flip whatever the current state is (Discord's API takes an
 * explicit boolean, so the toggle itself is Kiyro reading the current state
 * first); `micVolumeUp`/`micVolumeDown` step Discord's own input-volume
 * slider, separate from — and not the same thing as — the OS-level `volume`
 * action above.
 */
export const DISCORD_COMMANDS = ['toggleMute', 'toggleDeafen', 'micVolumeUp', 'micVolumeDown'] as const;
export type DiscordCommand = (typeof DISCORD_COMMANDS)[number];

/**
 * What a control does when it is triggered.
 *
 * A discriminated union so every consumer is forced to handle new action types
 * explicitly rather than silently ignoring them.
 */
export type Action =
  | { type: 'none' }
  | { type: 'keyboard'; key: string }
  | { type: 'hotkey'; modifiers: Modifier[]; key: string }
  | { type: 'text'; text: string }
  | { type: 'media'; command: MediaCommand }
  /**
   * `step` is how many volume notches one press moves. Windows' volume keys
   * move 2 percentage points each, so `step: 1` is a 2% change, `step: 5` a
   * 10% one — the slider is in Windows' own units, not percent.
   */
  | { type: 'volume'; command: VolumeCommand; step?: number }
  | { type: 'scroll'; direction: ScrollDirection; amount: number }
  | { type: 'mouse'; button: MouseButton }
  | { type: 'system'; command: SystemCommand }
  /**
   * Switches Kiyro's own active profile — the macro pad reconfiguring
   * itself. Handled by the execution pipeline rather than the OS-level
   * executor (`electron/execution-pipeline.ts`), since it changes Kiyro's
   * state instead of pressing anything.
   */
  | { type: 'profile'; command: ProfileCommand }
  /**
   * Handled the same way `profile` is: intercepted in
   * `electron/execution-pipeline.ts` rather than the OS-level executor,
   * since it talks to Discord over IPC instead of pressing anything.
   */
  | { type: 'discord'; command: DiscordCommand }
  /**
   * Launches or focuses an application. `kind` says how `target` is opened:
   * `'path'` is an absolute file path (an .exe, typically chosen via the
   * native file picker), run through `shell.openPath`; `'uri'` is a URL or
   * a registered custom protocol (`https://…`, `discord://`, `vscode://`),
   * run through `shell.openExternal`. See `electron/native-execution.ts`.
   */
  | { type: 'application'; label: string; target: string; kind: 'path' | 'uri' };

export type ActionType = Action['type'];

export const NO_ACTION: Action = { type: 'none' };

/** Bindings keyed by `ControlId`. Controls with no entry are unassigned. */
export type BindingMap = Record<string, Action>;
