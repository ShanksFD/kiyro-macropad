import type { Modifier } from './keys';

export const MEDIA_COMMANDS = ['playPause', 'next', 'previous', 'stop'] as const;
export type MediaCommand = (typeof MEDIA_COMMANDS)[number];

export const VOLUME_COMMANDS = ['up', 'down', 'mute'] as const;
export type VolumeCommand = (typeof VOLUME_COMMANDS)[number];

export const SCROLL_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type ScrollDirection = (typeof SCROLL_DIRECTIONS)[number];

export const MOUSE_BUTTONS = ['left', 'right', 'middle'] as const;
export type MouseButton = (typeof MOUSE_BUTTONS)[number];

export const SYSTEM_COMMANDS = ['lock', 'sleep', 'screenshot'] as const;
export type SystemCommand = (typeof SYSTEM_COMMANDS)[number];

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
  | { type: 'volume'; command: VolumeCommand; step?: number }
  | { type: 'scroll'; direction: ScrollDirection; amount: number }
  /** Planned — no execution path exists yet. */
  | { type: 'mouse'; button: MouseButton }
  /** Planned. */
  | { type: 'system'; command: SystemCommand }
  /** Planned. */
  | { type: 'application'; label: string; target: string };

export type ActionType = Action['type'];

export const NO_ACTION: Action = { type: 'none' };

/** Bindings keyed by `ControlId`. Controls with no entry are unassigned. */
export type BindingMap = Record<string, Action>;
