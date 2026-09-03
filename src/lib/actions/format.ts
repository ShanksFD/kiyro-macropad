import {
  DISCORD_LABELS,
  MEDIA_LABELS,
  PROFILE_LABELS,
  SCROLL_LABELS,
  SYSTEM_LABELS,
  VOLUME_LABELS,
} from './catalog';
import { keyLabel, modifierLabel, sortModifiers } from './keys';
import type { Modifier } from './keys';
import type { Action } from './types';

export interface ActionLabel {
  /** Big text on the key cap. Kept to a couple of tokens. */
  primary: string;
  /** Optional qualifier under the primary label. */
  secondary?: string;
  /** Full description for tooltips and the inspector. */
  full: string;
}

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

/** Renders a hotkey as `Ctrl + Shift + S`. */
export function formatHotkey(modifiers: readonly Modifier[], key: string): string {
  return [
    ...sortModifiers(modifiers).map((modifier) => modifierLabel(modifier)),
    keyLabel(key),
  ].join(' + ');
}

/**
 * The single place an action turns into display text.
 *
 * Every surface (key cap, inspector, profile list, export preview) goes through
 * this so an action never renders two different ways.
 */
export function describeAction(action: Action): ActionLabel {
  switch (action.type) {
    case 'none':
      return { primary: '—', full: 'No action' };

    case 'keyboard': {
      const label = keyLabel(action.key);
      return { primary: label, secondary: 'Key', full: `Keyboard · ${label}` };
    }

    case 'hotkey': {
      const modifiers = sortModifiers(action.modifiers).map((modifier) => modifierLabel(modifier));
      const full = formatHotkey(action.modifiers, action.key);
      return {
        primary: keyLabel(action.key),
        secondary: modifiers.join(' + ') || 'Shortcut',
        full: `Shortcut · ${full}`,
      };
    }

    case 'text': {
      const firstLine = action.text.split('\n')[0] ?? '';
      const preview = firstLine.trim() === '' ? 'Empty text' : truncate(firstLine.trim(), 18);
      return { primary: preview, secondary: 'Text', full: `Text · ${truncate(action.text, 120)}` };
    }

    case 'media':
      return {
        primary: MEDIA_LABELS[action.command],
        secondary: 'Media',
        full: `Media · ${MEDIA_LABELS[action.command]}`,
      };

    case 'volume': {
      // Mute has no step; for up/down the step is the whole point of the
      // setting, so it belongs in the description — without it two bindings
      // that behave very differently render identically.
      const step = action.command === 'mute' ? null : (action.step ?? 1);
      return {
        primary: VOLUME_LABELS[action.command],
        secondary: step === null ? 'Volume' : `${step} step${step === 1 ? '' : 's'}`,
        full: `Volume · ${VOLUME_LABELS[action.command]}${step === null ? '' : ` (${step})`}`,
      };
    }

    case 'scroll':
      return {
        primary: SCROLL_LABELS[action.direction],
        secondary: `${action.amount} step${action.amount === 1 ? '' : 's'}`,
        full: `Scroll · ${SCROLL_LABELS[action.direction]} (${action.amount})`,
      };

    case 'mouse':
      return {
        primary: `${action.button[0]?.toUpperCase()}${action.button.slice(1)} click`,
        secondary: 'Mouse',
        full: `Mouse · ${action.button} click`,
      };

    case 'system':
      return {
        primary: SYSTEM_LABELS[action.command],
        secondary: 'System',
        full: `System · ${SYSTEM_LABELS[action.command]}`,
      };

    case 'application':
      return {
        primary: truncate(action.label || 'Application', 18),
        secondary: 'App',
        full: `Application · ${action.label || action.target || 'Not configured'}`,
      };

    case 'profile':
      return {
        primary: PROFILE_LABELS[action.command],
        secondary: 'Profile',
        full: `Profile · ${PROFILE_LABELS[action.command]}`,
      };

    case 'discord': {
      // Only the two mic-volume commands carry a step — mute/deafen have
      // nothing to show one for, so a plain "Discord" secondary/no
      // qualifier there matches how `volume`'s mute case does the same.
      const isVolumeCommand = action.command === 'micVolumeUp' || action.command === 'micVolumeDown';
      const step = isVolumeCommand ? (action.step ?? 10) : null;
      return {
        primary: DISCORD_LABELS[action.command],
        secondary: step === null ? 'Discord' : `${step}%`,
        full: `Discord · ${DISCORD_LABELS[action.command]}${step === null ? '' : ` (${step}%)`}`,
      };
    }

    default:
      return { primary: '—', full: 'No action' };
  }
}

export function isEmptyAction(action: Action | undefined): boolean {
  return action === undefined || action.type === 'none';
}

/** Structural equality — used to compute the dirty state without a deep-equal dependency. */
export function actionsEqual(a: Action | undefined, b: Action | undefined): boolean {
  if (isEmptyAction(a) && isEmptyAction(b)) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
