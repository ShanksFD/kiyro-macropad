import { APP_LAUNCH_PRESETS } from './app-launch-presets';
import { describeAction } from './format';
import type { Action } from './types';

export interface ActionPreset {
  id: string;
  label: string;
  /** Extra search terms that are not part of the label. */
  keywords: string;
  action: Action;
}

const preset = (id: string, label: string, action: Action, keywords = ''): ActionPreset => ({
  id,
  label,
  keywords,
  action,
});

/** Common bindings, offered through the picker's search field. */
export const ACTION_PRESETS: readonly ActionPreset[] = [
  preset(
    'copy',
    'Copy',
    { type: 'hotkey', modifiers: ['Control'], key: 'KeyC' },
    'ctrl c clipboard',
  ),
  preset(
    'paste',
    'Paste',
    { type: 'hotkey', modifiers: ['Control'], key: 'KeyV' },
    'ctrl v clipboard',
  ),
  preset('cut', 'Cut', { type: 'hotkey', modifiers: ['Control'], key: 'KeyX' }, 'ctrl x clipboard'),
  preset('undo', 'Undo', { type: 'hotkey', modifiers: ['Control'], key: 'KeyZ' }, 'ctrl z'),
  preset(
    'redo',
    'Redo',
    { type: 'hotkey', modifiers: ['Control', 'Shift'], key: 'KeyZ' },
    'ctrl shift z',
  ),
  preset('save', 'Save', { type: 'hotkey', modifiers: ['Control'], key: 'KeyS' }, 'ctrl s'),
  preset(
    'save-as',
    'Save As',
    { type: 'hotkey', modifiers: ['Control', 'Shift'], key: 'KeyS' },
    'ctrl shift s',
  ),
  preset('find', 'Find', { type: 'hotkey', modifiers: ['Control'], key: 'KeyF' }, 'ctrl f search'),
  preset(
    'switch-app',
    'Switch application',
    { type: 'hotkey', modifiers: ['Alt'], key: 'Tab' },
    'alt tab',
  ),
  preset('screenshot-key', 'Print Screen', { type: 'keyboard', key: 'PrintScreen' }, 'screenshot'),
  preset('refresh', 'Refresh', { type: 'keyboard', key: 'F5' }, 'reload'),
  preset('escape', 'Escape', { type: 'keyboard', key: 'Escape' }, 'esc cancel'),
  preset('enter', 'Enter', { type: 'keyboard', key: 'Enter' }, 'return'),
  preset('volume-up', 'Volume Up', { type: 'volume', command: 'up', step: 1 }, 'louder audio'),
  preset(
    'volume-down',
    'Volume Down',
    { type: 'volume', command: 'down', step: 1 },
    'quieter audio',
  ),
  preset('mute', 'Mute', { type: 'volume', command: 'mute' }, 'silence audio'),
  preset('play-pause', 'Play / Pause', { type: 'media', command: 'playPause' }, 'music transport'),
  preset('next-track', 'Next Track', { type: 'media', command: 'next' }, 'skip music'),
  preset('previous-track', 'Previous Track', { type: 'media', command: 'previous' }, 'back music'),
  preset('scroll-up', 'Scroll Up', { type: 'scroll', direction: 'up', amount: 3 }, 'wheel'),
  preset('scroll-down', 'Scroll Down', { type: 'scroll', direction: 'down', amount: 3 }, 'wheel'),
  preset('lock-screen', 'Lock Screen', { type: 'system', command: 'lock' }, 'win l windows lock'),
  preset('sleep', 'Sleep', { type: 'system', command: 'sleep' }, 'suspend power'),
  preset(
    'screenshot',
    'Screenshot (select area)',
    { type: 'system', command: 'screenshot' },
    'screen capture snip snipping tool win shift s region',
  ),
  preset(
    'screenshot-full',
    'Screenshot (all screens)',
    { type: 'system', command: 'screenshotFull' },
    'screen capture win print fullscreen monitors',
  ),
  preset(
    'display-off',
    'Turn Off Displays',
    { type: 'system', command: 'displayOff' },
    'monitor screen blank power',
  ),
  preset(
    'task-manager',
    'Task Manager',
    { type: 'system', command: 'taskManager' },
    'ctrl shift esc processes taskmgr',
  ),
  preset(
    'file-explorer',
    'File Explorer',
    { type: 'system', command: 'fileExplorer' },
    'win e files folder',
  ),
  preset(
    'windows-settings',
    'Windows Settings',
    { type: 'system', command: 'settings' },
    'win i preferences control panel',
  ),
  preset(
    'show-desktop',
    'Show Desktop',
    { type: 'system', command: 'showDesktop' },
    'win d minimise minimize',
  ),
  preset('sign-out', 'Sign Out', { type: 'system', command: 'signOut' }, 'log off logout session'),
  preset('restart', 'Restart', { type: 'system', command: 'restart' }, 'reboot power'),
  preset('shut-down', 'Shut Down', { type: 'system', command: 'shutDown' }, 'power off turn off'),
  preset(
    'next-profile',
    'Next Profile',
    { type: 'profile', command: 'next' },
    'switch cycle layer preset',
  ),
  preset(
    'previous-profile',
    'Previous Profile',
    { type: 'profile', command: 'previous' },
    'switch cycle layer preset back',
  ),
  preset(
    'discord-toggle-mute',
    'Toggle Mute',
    { type: 'discord', command: 'toggleMute' },
    'discord mic microphone unmute',
  ),
  preset(
    'discord-toggle-deafen',
    'Toggle Deafen',
    { type: 'discord', command: 'toggleDeafen' },
    'discord undeafen headphones',
  ),
  preset(
    'discord-mic-volume-up',
    'Mic Volume Up',
    { type: 'discord', command: 'micVolumeUp' },
    'discord microphone gain sensitivity louder',
  ),
  preset(
    'discord-mic-volume-down',
    'Mic Volume Down',
    { type: 'discord', command: 'micVolumeDown' },
    'discord microphone gain sensitivity quieter',
  ),
  preset(
    'discord-output-volume-up',
    'Output Volume Up',
    { type: 'discord', command: 'outputVolumeUp' },
    'discord speaker headphones listen louder',
  ),
  preset(
    'discord-output-volume-down',
    'Output Volume Down',
    { type: 'discord', command: 'outputVolumeDown' },
    'discord speaker headphones listen quieter',
  ),
  // Same built-in apps as the "Application" tab's own quick-picks
  // (`app-launch-presets.ts`) — kept in one place, spread in here so they're
  // reachable from the top search box too, like every other preset.
  ...APP_LAUNCH_PRESETS.map((item) => preset(`app-${item.id}`, item.label, item.action, 'app launch open')),
];

export function searchPresets(query: string): ActionPreset[] {
  const term = query.trim().toLowerCase();
  if (term.length === 0) return [...ACTION_PRESETS];

  return ACTION_PRESETS.filter((item) =>
    `${item.label} ${item.keywords} ${describeAction(item.action).full}`
      .toLowerCase()
      .includes(term),
  );
}
