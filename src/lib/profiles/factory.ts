import type { Action, BindingMap } from '../actions/types';
import { actionsEqual } from '../actions/format';
import type { DeviceDefinition } from '../devices/types';
import { PROFILE_SCHEMA_VERSION } from './types';
import type { MacroProfile } from './types';

/** Stable, collision-resistant id without pulling in a uuid dependency. */
export function createId(prefix = 'p'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createProfile(options: {
  name: string;
  deviceId: string;
  description?: string;
  bindings?: BindingMap;
}): MacroProfile {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    deviceId: options.deviceId,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    bindings: options.bindings ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The profile a first-time user lands on.
 *
 * Encoder defaults mirror what people expect from a volume knob, so the device
 * is useful before anything is configured.
 */
export function createDefaultProfile(device: DeviceDefinition): MacroProfile {
  const bindings: BindingMap = {};

  const [first, second] = device.encoders;
  if (first) {
    bindings[first.clockwise.id] = { type: 'volume', command: 'up', step: 1 };
    bindings[first.counterClockwise.id] = { type: 'volume', command: 'down', step: 1 };
    bindings[first.press.id] = { type: 'volume', command: 'mute' };
  }
  if (second) {
    bindings[second.clockwise.id] = { type: 'scroll', direction: 'up', amount: 3 };
    bindings[second.counterClockwise.id] = { type: 'scroll', direction: 'down', amount: 3 };
    bindings[second.press.id] = { type: 'media', command: 'playPause' };
  }

  return createProfile({
    name: 'Default',
    deviceId: device.id,
    description: 'Starting point with the encoders wired to volume and scrolling.',
    bindings,
  });
}

export function duplicateProfile(profile: MacroProfile, name?: string): MacroProfile {
  const now = new Date().toISOString();
  return {
    ...profile,
    id: createId(),
    name: name ?? `${profile.name} copy`,
    createdAt: now,
    updatedAt: now,
  };
}

export function touchProfile(profile: MacroProfile, bindings: BindingMap): MacroProfile {
  return { ...profile, bindings, updatedAt: new Date().toISOString() };
}

/** Removes `none` entries so an "unassigned" control never persists as noise. */
export function normalizeBindings(bindings: BindingMap): BindingMap {
  const result: BindingMap = {};
  for (const [controlId, action] of Object.entries(bindings)) {
    if (action && action.type !== 'none') result[controlId] = action;
  }
  return result;
}

export function bindingsEqual(a: BindingMap, b: BindingMap): boolean {
  const left = normalizeBindings(a);
  const right = normalizeBindings(b);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const key of keys) {
    if (!actionsEqual(left[key], right[key])) return false;
  }
  return true;
}

export function countAssigned(bindings: BindingMap): number {
  return Object.values(bindings).filter((action: Action) => action.type !== 'none').length;
}
