import type {
  Action,
  ActionType,
  DiscordCommand,
  MediaCommand,
  ProfileCommand,
  ScrollDirection,
  SystemCommand,
  VolumeCommand,
} from './types';

/** Picker grouping. `none` is handled by the "Clear" affordance, not a tab. */
export type ActionCategoryId =
  | 'keyboard'
  | 'hotkey'
  | 'text'
  | 'media'
  | 'mouse'
  | 'system'
  | 'application'
  | 'profile'
  | 'discord';

export type ActionAvailability =
  /** Fully modelled, editable, and understood by the current execution mode. */
  | 'available'
  /** Modelled and editable, but nothing can execute it yet. */
  | 'planned';

export interface ActionCategory {
  id: ActionCategoryId;
  label: string;
  description: string;
  availability: ActionAvailability;
  /** Action types a user can create from this category. */
  types: ActionType[];
}

export const ACTION_CATEGORIES: readonly ActionCategory[] = [
  {
    id: 'application',
    label: 'Application',
    description: 'Launch or focus an application.',
    availability: 'available',
    types: ['application'],
  },
  {
    id: 'media',
    label: 'Media',
    description: 'Transport and volume controls.',
    availability: 'available',
    types: ['media', 'volume'],
  },
  {
    id: 'hotkey',
    label: 'Shortcut',
    description: 'Send a key combination such as Ctrl + Shift + S.',
    availability: 'available',
    types: ['hotkey'],
  },
  {
    id: 'system',
    label: 'System',
    description: 'Lock, sleep, screen capture, power and shell shortcuts.',
    availability: 'available',
    types: ['system'],
  },
  {
    id: 'profile',
    label: 'Profile',
    description: 'Switch which Kiyro profile the pad is using.',
    availability: 'available',
    types: ['profile'],
  },
  {
    id: 'discord',
    label: 'Discord',
    description: 'Mute, deafen, and mic volume — talks to Discord directly, not a keystroke.',
    availability: 'available',
    types: ['discord'],
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    description: 'Send a single key.',
    availability: 'available',
    types: ['keyboard'],
  },
  {
    id: 'text',
    label: 'Text',
    description: 'Type a stored snippet of text.',
    availability: 'available',
    types: ['text'],
  },

  {
    id: 'mouse',
    label: 'Mouse',
    description: 'Scrolling and mouse buttons.',
    availability: 'available',
    types: ['scroll', 'mouse'],
  },
];

/**
 * Availability per action type.
 *
 * `planned` types are modelled end to end (typed, validated, editable,
 * importable) but the UI must state plainly that nothing executes them yet.
 */
export const ACTION_AVAILABILITY: Record<ActionType, ActionAvailability> = {
  none: 'available',
  keyboard: 'available',
  hotkey: 'available',
  text: 'available',
  media: 'available',
  volume: 'available',
  scroll: 'available',
  // Both fully implemented in `electron/native-execution.ts` — these were
  // still marked 'planned' after the fact, which falsely showed "saved but
  // cannot run yet" on already-working bindings.
  mouse: 'available',
  system: 'available',
  application: 'available',
  profile: 'available',
  discord: 'available',
};

export function isPlannedAction(action: Action): boolean {
  return ACTION_AVAILABILITY[action.type] === 'planned';
}

export function categoryOfAction(action: Action): ActionCategoryId | null {
  switch (action.type) {
    case 'keyboard':
      return 'keyboard';
    case 'hotkey':
      return 'hotkey';
    case 'text':
      return 'text';
    case 'media':
    case 'volume':
      return 'media';
    case 'scroll':
    case 'mouse':
      return 'mouse';
    case 'system':
      return 'system';
    case 'application':
      return 'application';
    case 'profile':
      return 'profile';
    case 'discord':
      return 'discord';
    default:
      return null;
  }
}

export const MEDIA_LABELS: Record<MediaCommand, string> = {
  playPause: 'Play / Pause',
  next: 'Next Track',
  previous: 'Previous Track',
  stop: 'Stop',
};

export const VOLUME_LABELS: Record<VolumeCommand, string> = {
  up: 'Volume Up',
  down: 'Volume Down',
  mute: 'Mute',
};

export const SCROLL_LABELS: Record<ScrollDirection, string> = {
  up: 'Scroll Up',
  down: 'Scroll Down',
  left: 'Scroll Left',
  right: 'Scroll Right',
};

export const SYSTEM_LABELS: Record<SystemCommand, string> = {
  lock: 'Lock Screen',
  sleep: 'Sleep',
  displayOff: 'Turn Off Displays',
  screenshot: 'Screenshot (select area)',
  screenshotFull: 'Screenshot (all screens)',
  taskManager: 'Task Manager',
  fileExplorer: 'File Explorer',
  settings: 'Windows Settings',
  showDesktop: 'Show Desktop',
  signOut: 'Sign Out',
  restart: 'Restart',
  shutDown: 'Shut Down',
};

/**
 * The three that end the session without asking. Surfaces that list system
 * commands use this to warn rather than hardcoding the names again.
 */
export const DESTRUCTIVE_SYSTEM_COMMANDS: readonly SystemCommand[] = [
  'signOut',
  'restart',
  'shutDown',
];

export const PROFILE_LABELS: Record<ProfileCommand, string> = {
  next: 'Next Profile',
  previous: 'Previous Profile',
};

export const DISCORD_LABELS: Record<DiscordCommand, string> = {
  toggleMute: 'Toggle Mute',
  toggleDeafen: 'Toggle Deafen',
  micVolumeUp: 'Mic Volume Up',
  micVolumeDown: 'Mic Volume Down',
  outputVolumeUp: 'Output Volume Up',
  outputVolumeDown: 'Output Volume Down',
};

/** Sensible starting point when a user switches an action to a new type. */
export function defaultActionOfType(type: ActionType): Action {
  switch (type) {
    case 'keyboard':
      return { type: 'keyboard', key: 'KeyA' };
    case 'hotkey':
      return { type: 'hotkey', modifiers: ['Control'], key: 'KeyC' };
    case 'text':
      return { type: 'text', text: '' };
    case 'media':
      return { type: 'media', command: 'playPause' };
    case 'volume':
      return { type: 'volume', command: 'up', step: 1 };
    case 'scroll':
      return { type: 'scroll', direction: 'up', amount: 3 };
    case 'mouse':
      return { type: 'mouse', button: 'left' };
    case 'system':
      return { type: 'system', command: 'lock' };
    case 'application':
      return { type: 'application', label: '', target: '', kind: 'path' };
    case 'profile':
      return { type: 'profile', command: 'next' };
    case 'discord':
      // `step` is only meaningful for `micVolumeUp`/`micVolumeDown`, but
      // seeded here regardless so switching to one of those commands
      // already has a sensible value instead of starting undefined.
      return { type: 'discord', command: 'toggleMute', step: 10 };
    default:
      return { type: 'none' };
  }
}
