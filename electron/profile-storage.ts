/**
 * Profile persistence — Electron's `userData` directory, JSON on disk.
 *
 * Same shape `LocalConfigurationRepository` (`@/lib/storage/configuration-repository.ts`)
 * used with `localStorage`: `{ profiles, activeProfileId }`. Kiyro's profile
 * layer stays exactly as it is; only where the bytes live changes, so this
 * needs to satisfy the same `ConfigurationRepository`-shaped contract, not a
 * new one — `electron-configuration-repository.ts` on the renderer side calls
 * straight through to this via IPC with no translation.
 *
 * Validated on read via the existing `profileCollectionSchema`
 * (`@/lib/profiles/schema.ts`) — storage on disk is exactly as untrusted as
 * `localStorage` was (a hand-edited file, a partial write, an old version).
 * Writes are atomic (temp file + rename) so a crash mid-write cannot corrupt
 * the file Kiyro reads next launch.
 */

import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { profileCollectionSchema } from '../src/lib/profiles/schema';
import type { MacroProfile } from '../src/lib/profiles/types';

interface StoredData {
  profiles: MacroProfile[];
  activeProfileId: string | null;
}

const EMPTY: StoredData = { profiles: [], activeProfileId: null };

function filePath(): string {
  return path.join(app.getPath('userData'), 'profiles.json');
}

async function read(): Promise<StoredData> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath(), 'utf-8');
  } catch {
    return EMPTY;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY;
    const candidate = parsed as { profiles?: unknown; activeProfileId?: unknown };
    const profiles = profileCollectionSchema.safeParse(candidate.profiles);
    const activeProfileId = typeof candidate.activeProfileId === 'string' ? candidate.activeProfileId : null;
    return { profiles: profiles.success ? profiles.data : [], activeProfileId };
  } catch {
    return EMPTY;
  }
}

async function write(data: StoredData): Promise<void> {
  const target = filePath();
  const tmp = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, target);
}

export const electronProfileStorage = {
  async list(): Promise<MacroProfile[]> {
    return (await read()).profiles;
  },

  async replaceAll(profiles: MacroProfile[]): Promise<void> {
    const current = await read();
    await write({ ...current, profiles });
  },

  async save(profile: MacroProfile): Promise<void> {
    const current = await read();
    const index = current.profiles.findIndex((candidate) => candidate.id === profile.id);
    const profiles = [...current.profiles];
    if (index >= 0) profiles[index] = profile;
    else profiles.push(profile);
    await write({ ...current, profiles });
  },

  async delete(id: string): Promise<void> {
    const current = await read();
    await write({ ...current, profiles: current.profiles.filter((profile) => profile.id !== id) });
  },

  async getActiveProfileId(): Promise<string | null> {
    return (await read()).activeProfileId;
  },

  async setActiveProfileId(id: string | null): Promise<void> {
    const current = await read();
    await write({ ...current, activeProfileId: id });
  },
};
