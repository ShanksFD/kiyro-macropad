import type { z } from 'zod';

/**
 * The only place `localStorage` is touched.
 *
 * Every read is schema-validated: storage is shared with other tabs, other app
 * versions and the user's devtools, so its contents are untrusted input.
 */

const NAMESPACE = 'kiyro';

export const StorageKey = {
  Profiles: `${NAMESPACE}.profiles.v1`,
  ActiveProfileId: `${NAMESPACE}.profiles.active.v1`,
  Preferences: `${NAMESPACE}.preferences.v1`,
} as const;

export type StorageKey = (typeof StorageKey)[keyof typeof StorageKey];

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Storage can throw in private modes or when cookies are blocked.
    return null;
  }
}

export function readJson<T>(key: string, schema: z.ZodType<T>): T | null {
  const raw = storage()?.getItem(key);
  if (!raw) return null;

  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded — the in-memory draft is still intact, so failing quietly
    // here is better than losing the user's editing session.
    console.warn('[kiyro] could not persist to local storage');
  }
}

export function readString(key: string): string | null {
  return storage()?.getItem(key) ?? null;
}

export function writeString(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    console.warn('[kiyro] could not persist to local storage');
  }
}

export function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* nothing useful to do */
  }
}
