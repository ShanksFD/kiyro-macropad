/**
 * Persists the Discord OAuth tokens Kiyro obtains from the one-time
 * authorization flow (`discord-rpc.ts`) — same treatment as
 * `profile-storage.ts`/`preferences-storage.ts`: `userData/discord-auth.json`,
 * validated on read, atomic write.
 *
 * Without this, every app restart would need the user to re-approve Kiyro
 * inside Discord (the RPC `AUTHORIZE` prompt) — tolerable once, not every
 * launch. `refreshToken` is what lets `discord-rpc.ts` silently mint a new
 * `accessToken` when the old one expires (Discord's typically last about a
 * week) instead of asking again.
 */

import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface DiscordTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

function isDiscordTokens(value: unknown): value is DiscordTokens {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    typeof candidate.expiresAt === 'number'
  );
}

function filePath(): string {
  return path.join(app.getPath('userData'), 'discord-auth.json');
}

export const discordTokenStorage = {
  async get(): Promise<DiscordTokens | null> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath(), 'utf-8');
    } catch {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return isDiscordTokens(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  async set(tokens: DiscordTokens): Promise<void> {
    const target = filePath();
    const tmp = `${target}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(tokens, null, 2), 'utf-8');
    await fs.rename(tmp, target);
  },

  /** Called when Discord rejects a token outright (revoked, app removed from their authorized-apps list) — the stale file must not keep being retried forever. */
  async clear(): Promise<void> {
    try {
      await fs.unlink(filePath());
    } catch {
      // Already gone — fine.
    }
  },
};
