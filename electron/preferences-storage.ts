/**
 * Preferences persistence — same treatment as `profile-storage.ts`:
 * `userData/preferences.json`, Zod-validated on read, atomic write.
 */

import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { preferencesSchema } from '../src/lib/preferences/schema';
import type { Preferences } from '../src/lib/preferences/schema';

function filePath(): string {
  return path.join(app.getPath('userData'), 'preferences.json');
}

export const electronPreferencesStorage = {
  async get(): Promise<Preferences | null> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath(), 'utf-8');
    } catch {
      return null;
    }

    try {
      const parsed = preferencesSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },

  async set(preferences: Preferences): Promise<void> {
    const target = filePath();
    const tmp = `${target}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(preferences, null, 2), 'utf-8');
    await fs.rename(tmp, target);
  },
};
