/**
 * A from-scratch client for Discord's local IPC ("RPC") protocol — the same
 * mechanism Rich Presence integrations use, repurposed here for voice
 * control (mute/deafen/mic volume) instead. No `discord-rpc` npm package:
 * that library is unmaintained and pulls in more than this needs: the wire
 * protocol itself is a small, stable, well-documented framing over a local
 * named pipe, easy enough to speak directly.
 *
 * THE PROTOCOL
 * ------------
 * Discord listens on `\\.\pipe\discord-ipc-0` through `-9` (multiple Discord
 * installs/instances claim consecutive indices) — a plain `net.Socket` in
 * Node talks to a Windows named pipe the same way it talks to a TCP socket.
 * Every message is a fixed 8-byte header (opcode: uint32 LE, length: uint32
 * LE) followed by that many bytes of UTF-8 JSON. `#read()` below is the
 * buffering parser for that, since TCP/pipe reads never line up with frame
 * boundaries.
 *
 * The flow, end to end:
 * 1. Send a HANDSHAKE frame `{v: 1, client_id}`. Discord answers with a
 *    DISPATCH `READY` event — no command needed to ask for this.
 * 2. Send an `AUTHORIZE` command (`scopes` include the *restricted*
 *    `rpc.voice.read`/`rpc.voice.write` this feature needs — see the doc
 *    comment on `DISCORD_CLIENT_SECRET`'s generator for what "restricted"
 *    costs you). Discord shows its own native consent prompt inside the
 *    already-open Discord app; approving it returns an OAuth `code`.
 * 3. Exchange that `code` for `access_token`/`refresh_token` via a plain
 *    HTTPS POST to Discord's OAuth token endpoint (`client_secret` required
 *    here — this is the one place it's used). This is *not* a browser
 *    redirect flow: the code already arrived over the pipe in step 2, so
 *    there's nothing to redirect.
 * 4. Send `AUTHENTICATE` with the `access_token` over the same pipe
 *    connection to authorize this session.
 * 5. Now `GET_VOICE_SETTINGS`/`SET_VOICE_SETTINGS` commands work.
 *
 * Steps 2–4 only happen once — after that, tokens are persisted
 * (`discord-token-storage.ts`) and reused, refreshing the access token
 * silently via `refresh_token` when it's near expiry, so nobody has to
 * re-approve Kiyro in Discord every launch.
 */

import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { DISCORD_CLIENT_SECRET } from './discord-secret';
import { discordTokenStorage } from './discord-token-storage';
import type { DiscordTokens } from './discord-token-storage';
import { Listeners } from '../src/lib/serial/emitter';

const CLIENT_ID = '1545072084122869832';
/**
 * Never actually navigated to — the authorization code comes back over the
 * IPC pipe itself (see the class doc comment), not a browser redirect. Still
 * has to be *a* URI registered in the Discord app's OAuth2 settings for the
 * token exchange to be accepted.
 */
const REDIRECT_URI = 'http://localhost';

const OPCODE = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 } as const;
const MAX_PIPE_INDEX = 9;
const HANDSHAKE_TIMEOUT_MS = 2000;
const COMMAND_TIMEOUT_MS = 8000;
/**
 * `AUTHORIZE` is the one command that waits on an actual human — noticing
 * Discord's consent prompt, reading it, clicking Authorize (and, per
 * `#authorizeFresh`'s own doc comment, this can involve Discord opening a
 * real browser window for elevated-scope consent, not just an in-app
 * popup, which takes longer still to notice and complete). The blanket
 * 8-second `COMMAND_TIMEOUT_MS` — sized for the fast, fully automated
 * exchanges (`AUTHENTICATE`, `GET_VOICE_SETTINGS`, `SET_VOICE_SETTINGS`) —
 * was nowhere near enough time for a person to do that, and giving up that
 * early had a nasty compounding effect: `#authorizeSession`'s retry-on-
 * rejection logic would see the timeout as "the token failed, try a fresh
 * authorization," firing a *second* AUTHORIZE (and a second popup) while
 * the user was still in the middle of dealing with the first one — which
 * reads exactly like "it keeps showing the prompt again and again." Two
 * minutes is a generous allowance for a person, not a program, to respond.
 */
const AUTHORIZE_TIMEOUT_MS = 120_000;
/** Refresh this long before actual expiry, so a command mid-flight never races an access token dying under it. */
const REFRESH_MARGIN_MS = 60_000;

/**
 * A discriminated union, not a plain string enum, specifically so `'error'`
 * can carry *why* — matching the pattern `UpdaterStatusPayload`
 * (`src/lib/electron/ipc-types.ts`) already established for exactly this
 * problem. Before this, every kind of failure (a rejected token, a genuine
 * scope/permission problem, a timeout) all collapsed into the same bare
 * `'disconnected'`, which is indistinguishable from "never tried" — the
 * Settings UI had nothing real to show someone besides a generic "didn't
 * work," which is exactly the situation that made a real bug (`AUTHORIZE`'s
 * timeout being far too short for a human) hard to tell apart from Discord's
 * own restricted-scope rejection (which needs a completely different fix —
 * adding the account as a Developer Portal tester, not a code change).
 */
export type DiscordStatus =
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'authorizing' }
  | { state: 'connected' }
  /** No `discord-ipc-*` pipe answered — Discord isn't running. */
  | { state: 'unavailable' }
  /** This build has no `KIYRO_DISCORD_CLIENT_SECRET` baked in — see `scripts/generate-build-secrets.mjs`. */
  | { state: 'unconfigured' }
  | { state: 'error'; message: string };

interface VoiceSettings {
  mute: boolean;
  deaf: boolean;
  input: { volume: number };
}

interface PendingCommand {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/** Buffers arbitrary-sized socket chunks into complete `{opcode, payload}` frames — reads never align to frame boundaries. */
class FrameReader {
  #buffer = Buffer.alloc(0);

  push(chunk: Buffer): Array<{ opcode: number; payload: unknown }> {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const frames: Array<{ opcode: number; payload: unknown }> = [];

    for (;;) {
      if (this.#buffer.length < 8) break;
      const opcode = this.#buffer.readUInt32LE(0);
      const length = this.#buffer.readUInt32LE(4);
      if (this.#buffer.length < 8 + length) break;

      const body = this.#buffer.subarray(8, 8 + length);
      this.#buffer = this.#buffer.subarray(8 + length);

      try {
        frames.push({ opcode, payload: body.length > 0 ? JSON.parse(body.toString('utf-8')) : null });
      } catch (error) {
        console.error('[kiyro][discord] malformed frame payload, dropping:', error);
      }
    }

    return frames;
  }
}

function encodeFrame(opcode: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

export class DiscordRpcClient {
  #status: DiscordStatus = { state: 'disconnected' };
  #socket: net.Socket | null = null;
  #reader = new FrameReader();
  #pending = new Map<string, PendingCommand>();
  /** Serializes `connect()` calls — every action method calls it, and two overlapping attempts must not open two sockets. */
  #connecting: Promise<void> | null = null;

  readonly #statusListeners = new Listeners<DiscordStatus>();

  get status(): DiscordStatus {
    return this.#status;
  }

  onStatusChange(listener: (status: DiscordStatus) => void): () => void {
    return this.#statusListeners.add(listener);
  }

  #setStatus(status: DiscordStatus): void {
    // Compared by `.state` rather than the whole object (which would never
    // be `===` anyway, being a fresh literal every call): skip a redundant
    // emit for the same simple state repeating, but always emit an `error`
    // even if the previous status also happened to be `error` — a second
    // failure's message is still worth telling, not silently swallowed
    // because the label matched.
    if (this.#status.state === status.state && status.state !== 'error') return;
    this.#status = status;
    this.#statusListeners.emit(status);
  }

  /**
   * Connects and authorizes if needed. Idempotent and safe to call before
   * every action — a no-op once already connected, and the thing that
   * quietly re-establishes the pipe after Discord restarts.
   */
  async connect(): Promise<void> {
    if (this.#status.state === 'connected') return;
    if (this.#connecting) return this.#connecting;

    this.#connecting = this.#doConnect().finally(() => {
      this.#connecting = null;
    });
    return this.#connecting;
  }

  /**
   * Closes the live pipe connection. Deliberately does *not* forget the
   * stored OAuth tokens (`discord-token-storage.ts`) — this is "stop talking
   * to Discord for now," not "revoke Kiyro's access." A later `connect()`
   * (or the next `discord` action pressed) reconnects using the same stored
   * tokens with no new consent prompt, exactly like the first connection
   * silently resuming after Discord itself restarts.
   */
  disconnect(): void {
    this.#teardown();
    this.#setStatus({ state: 'disconnected' });
  }

  async #doConnect(): Promise<void> {
    if (DISCORD_CLIENT_SECRET === '') {
      this.#setStatus({ state: 'unconfigured' });
      return;
    }

    this.#setStatus({ state: 'connecting' });

    const socket = await this.#openPipe();
    if (!socket) {
      this.#setStatus({ state: 'unavailable' });
      return;
    }
    this.#socket = socket;

    try {
      await this.#authorizeSession();
      this.#setStatus({ state: 'connected' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[kiyro][discord] authorization failed:', error);
      this.#teardown();
      this.#setStatus({ state: 'error', message });
    }
  }

  /** Tries each candidate pipe in turn, keeping the first one that completes a handshake. */
  async #openPipe(): Promise<net.Socket | null> {
    for (let index = 0; index <= MAX_PIPE_INDEX; index += 1) {
      // Sequential by design: only one Discord install is ever actually
      // listening, and trying pipes concurrently would just race duplicate
      // sockets against each other for no benefit.
      const socket = await this.#tryPipe(`\\\\.\\pipe\\discord-ipc-${index}`);
      if (socket) return socket;
    }
    return null;
  }

  #tryPipe(path: string): Promise<net.Socket | null> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ path });
      const reader = new FrameReader();
      let settled = false;

      const finish = (result: net.Socket | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.removeAllListeners();
        if (!result) socket.destroy();
        resolve(result);
      };

      const timeout = setTimeout(() => finish(null), HANDSHAKE_TIMEOUT_MS);

      socket.on('error', () => finish(null));
      socket.on('close', () => finish(null));

      socket.on('connect', () => {
        socket.write(encodeFrame(OPCODE.HANDSHAKE, { v: 1, client_id: CLIENT_ID }));
      });

      socket.on('data', (chunk: Buffer) => {
        for (const frame of reader.push(chunk)) {
          const data = frame.payload as { evt?: string } | null;
          if (frame.opcode === OPCODE.FRAME && data?.evt === 'READY') {
            // Ownership of framing/dispatch moves to the instance-level
            // handlers from here — remove this probe's own listeners without
            // destroying the socket underneath them.
            clearTimeout(timeout);
            settled = true;
            socket.removeAllListeners();
            resolve(socket);
          }
        }
      });
    });
  }

  #wireLongLivedSocket(socket: net.Socket): void {
    socket.on('data', (chunk: Buffer) => {
      for (const frame of this.#reader.push(chunk)) this.#handleFrame(frame);
    });
    socket.on('close', () => {
      console.log('[kiyro][discord] pipe closed');
      this.#teardown();
      this.#setStatus({ state: 'disconnected' });
    });
    socket.on('error', (error) => {
      console.error('[kiyro][discord] socket error:', error);
    });
  }

  #handleFrame(frame: { opcode: number; payload: unknown }): void {
    if (frame.opcode !== OPCODE.FRAME) return;
    const message = frame.payload as { nonce?: string; evt?: string; data?: unknown } | null;
    if (!message?.nonce) return; // DISPATCH events with no nonce (only READY today) — nothing currently subscribes to these.

    const pending = this.#pending.get(message.nonce);
    if (!pending) return;
    this.#pending.delete(message.nonce);
    clearTimeout(pending.timer);

    if (message.evt === 'ERROR') {
      const errorData = message.data as { message?: string } | undefined;
      pending.reject(new Error(errorData?.message ?? 'Discord RPC error'));
    } else {
      pending.resolve(message.data);
    }
  }

  #sendCommand(cmd: string, args: unknown, timeoutMs: number = COMMAND_TIMEOUT_MS): Promise<unknown> {
    if (!this.#socket) return Promise.reject(new Error('Discord RPC socket not open'));

    const nonce = randomUUID();
    const socket = this.#socket;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(nonce);
        reject(new Error(`Discord RPC command '${cmd}' timed out`));
      }, timeoutMs);

      this.#pending.set(nonce, { resolve, reject, timer });
      socket.write(encodeFrame(OPCODE.FRAME, { cmd, args, nonce }));
    });
  }

  /** Runs the one-time (or once-per-token-expiry) authorization sequence — see the class doc comment for the full flow. */
  async #authorizeSession(): Promise<void> {
    if (!this.#socket) throw new Error('no socket');
    this.#wireLongLivedSocket(this.#socket);

    const stored = await discordTokenStorage.get();
    const tokens = stored && stored.expiresAt - Date.now() > REFRESH_MARGIN_MS
      ? stored
      : stored
        ? await this.#refreshTokens(stored.refreshToken)
        : await this.#authorizeFresh();

    try {
      await this.#sendCommand('AUTHENTICATE', { access_token: tokens.accessToken });
    } catch (error) {
      // A token that looked fresh by our own `expiresAt` bookkeeping can
      // still be rejected here — the common real-world cause is the user
      // revoking Kiyro's access from Discord's own Authorized Apps
      // settings, which invalidates it immediately regardless of what our
      // stored expiry says. `#refreshTokens` already handles this
      // correctly when *it's* the one that gets rejected (clears the
      // stored tokens and re-authorizes); this is the same recovery for
      // when the stale token fails right here instead, on the branch that
      // skipped refreshing entirely because it didn't look expired yet.
      // Without this, a revoked-but-not-yet-expired token made every future
      // "Connect" click fail silently — no popup, no error the user could
      // see, just back to "Not connected" — since nothing here used to
      // retry, only give up.
      console.warn('[kiyro][discord] stored access token rejected, re-authorizing:', error);
      await discordTokenStorage.clear();
      const fresh = await this.#authorizeFresh();
      await this.#sendCommand('AUTHENTICATE', { access_token: fresh.accessToken });
    }
  }

  /**
   * Sends `AUTHORIZE` with `AUTHORIZE_TIMEOUT_MS`, not the default — for
   * restricted scopes like `rpc.voice.write` Discord's consent step can
   * open an actual browser window instead of just an in-app popup, which
   * takes a person real time to notice and complete either way. See
   * `AUTHORIZE_TIMEOUT_MS`'s own comment for what happens if this times out
   * too early.
   */
  async #authorizeFresh(): Promise<DiscordTokens> {
    this.#setStatus({ state: 'authorizing' });
    const authorizeResult = (await this.#sendCommand(
      'AUTHORIZE',
      { client_id: CLIENT_ID, scopes: ['rpc', 'rpc.voice.read', 'rpc.voice.write'] },
      AUTHORIZE_TIMEOUT_MS,
    )) as { code: string };

    return this.#exchangeCode(authorizeResult.code);
  }

  async #exchangeCode(code: string): Promise<DiscordTokens> {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      throw new Error(`Discord token exchange failed (HTTP ${response.status})`);
    }

    return this.#storeTokenResponse(await response.json());
  }

  async #refreshTokens(refreshToken: string): Promise<DiscordTokens> {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      // A rejected refresh token means Kiyro's authorization was revoked (or
      // the app removed from Discord's connected-apps list) — the only way
      // forward is a fresh consent prompt, not another refresh attempt.
      await discordTokenStorage.clear();
      return this.#authorizeFresh();
    }

    return this.#storeTokenResponse(await response.json());
  }

  async #storeTokenResponse(body: unknown): Promise<DiscordTokens> {
    const parsed = body as { access_token: string; refresh_token: string; expires_in: number };
    const tokens: DiscordTokens = {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token,
      expiresAt: Date.now() + parsed.expires_in * 1000,
    };
    await discordTokenStorage.set(tokens);
    return tokens;
  }

  #teardown(): void {
    this.#socket?.removeAllListeners();
    this.#socket?.destroy();
    this.#socket = null;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Discord RPC disconnected'));
    }
    this.#pending.clear();
  }

  // -- Voice actions ---------------------------------------------------

  async #getVoiceSettings(): Promise<VoiceSettings> {
    return (await this.#sendCommand('GET_VOICE_SETTINGS', {})) as VoiceSettings;
  }

  async #setVoiceSettings(patch: Partial<VoiceSettings>): Promise<VoiceSettings> {
    return (await this.#sendCommand('SET_VOICE_SETTINGS', patch)) as VoiceSettings;
  }

  /** Discord's API takes an explicit boolean, not a toggle — reading current state first is what makes this a toggle at all. */
  async toggleMute(): Promise<void> {
    await this.connect();
    if (this.#status.state !== 'connected') throw new Error(`Discord not connected (${this.#status.state})`);
    const current = await this.#getVoiceSettings();
    await this.#setVoiceSettings({ mute: !current.mute });
  }

  async toggleDeafen(): Promise<void> {
    await this.connect();
    if (this.#status.state !== 'connected') throw new Error(`Discord not connected (${this.#status.state})`);
    const current = await this.#getVoiceSettings();
    await this.#setVoiceSettings({ deaf: !current.deaf });
  }

  /**
   * `direction` is `1` for up, `-1` for down. `step` is how many
   * percentage points one press moves — unlike the OS-level `volume`
   * action's `step` (Windows notches of ~2% each), this is a direct
   * percentage of Discord's own 0–100 input-volume slider, so `step: 10`
   * really does mean "move by 10%." Clamped to Discord's normal
   * (non-boosted) 0–100 range regardless of what's passed in.
   */
  async adjustMicVolume(direction: 1 | -1, step: number): Promise<void> {
    await this.connect();
    if (this.#status.state !== 'connected') throw new Error(`Discord not connected (${this.#status.state})`);
    const current = await this.#getVoiceSettings();
    const clampedStep = Math.min(100, Math.max(1, Math.trunc(step)));
    const next = Math.min(100, Math.max(0, current.input.volume + direction * clampedStep));
    await this.#setVoiceSettings({ input: { volume: next } });
  }
}

export const discordRpcClient = new DiscordRpcClient();
