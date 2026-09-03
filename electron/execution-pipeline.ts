/**
 * Glues serial -> resolve -> execute together, entirely inside the main
 * process. This is the hot path: it runs as a plain event-handler chain off
 * the serial port's `data` event, with no IPC round-trip and no dependency on
 * the renderer or React — pressing a button executes immediately whether or
 * not a window is even focused.
 *
 * IPC sends to the renderer happen afterwards, fire-and-forget, purely so the
 * UI can mirror what happened (live highlight, debug console, execution
 * chip). Losing that mirror (e.g. no window yet) must never affect execution.
 */

import { Notification } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'node:path';
import type {
  DeviceEventPayload,
  DeviceStatusPayload,
  ExecutionOutcomePayload,
  SetActiveProfilePayload,
} from '../src/lib/electron/ipc-types';
import { IpcChannel } from '../src/lib/electron/ipc-types';
import type { Action } from '../src/lib/actions/types';
import type { ExecutionOutcome } from '../src/lib/execution/executor';
import { ActiveProfileStore, resolveControlEvent } from './resolve-control';
import { discordRpcClient } from './discord-rpc';
import { nativeActionExecutor } from './native-execution';
import { electronProfileStorage } from './profile-storage';
import { SerialBridge } from './serial-bridge';

// This file compiles to `dist-electron/electron/execution-pipeline.js`, the
// same directory `main.ts` runs from, so the identical relative path resolves
// to the same `electron/assets/icon.ico` its `WINDOW_ICON_PATH` uses.
const NOTIFICATION_ICON_PATH = path.join(__dirname, '../../electron/assets/icon.ico');

export class ExecutionPipeline {
  readonly bridge = new SerialBridge();
  readonly profiles = new ActiveProfileStore();

  constructor(private readonly getWindow: () => BrowserWindow | null) {
    this.bridge.onStateChange((state) => {
      const payload: DeviceStatusPayload = {
        status: state.status,
        deviceId: state.deviceId,
        portInfo: state.portInfo,
        error: state.error,
        latencyMs: state.latencyMs,
      };
      this.#send(IpcChannel.DeviceStatus, payload);
    });

    this.bridge.onEvent((event) => {
      const resolution = resolveControlEvent(event);
      const at = Date.now();

      if (resolution.status === 'mapped') {
        const action = this.profiles.getBinding(resolution.controlId);
        console.log(
          `[kiyro][diag] button resolved to ${resolution.controlId}; ActiveProfileStore.profileId=${this.profiles.profileId}; binding=${action ? JSON.stringify(action) : 'none'}`,
        );
        if (action) {
          const outcome = this.#execute(resolution.controlId, action, at);
          console.log(`[kiyro] ${resolution.controlId} -> ${outcome.status}${'message' in outcome ? `: ${outcome.message}` : ''}`);
          const outcomePayload: ExecutionOutcomePayload = { controlId: resolution.controlId, action, outcome, at };
          this.#send(IpcChannel.ExecutionOutcome, outcomePayload);
        } else {
          console.log(`[kiyro] ${resolution.controlId} (unbound)`);
        }
      } else if (resolution.status === 'unmapped' && resolution.event.type !== 'unknown') {
        console.log(`[kiyro] event ${JSON.stringify(resolution.event)} did not resolve to any control`);
      }

      const eventPayload: DeviceEventPayload = { event, resolution, at };
      this.#send(IpcChannel.DeviceEvent, eventPayload);
    });
  }

  start(explicitPath?: string): void {
    this.bridge.start(explicitPath);
  }

  stop(): void {
    this.bridge.stop();
  }

  setActiveProfile(payload: SetActiveProfilePayload): void {
    this.profiles.setActiveProfile(payload);
    console.log(
      `[kiyro] active profile set: ${payload.profileId} (${Object.keys(payload.bindings).length} bindings)`,
    );
  }

  /**
   * `profile` and `discord` actions are both intercepted here rather than
   * passed to the stateless `nativeActionExecutor`: `profile` changes this
   * process's own state, and `discord` talks over its own IPC connection to
   * Discord — neither is an OS-level keystroke. Everything else passes
   * straight through unchanged.
   */
  #execute(controlId: string, action: Action, at: number): ExecutionOutcome {
    if (action.type === 'profile') {
      // Fire-and-forget, like every other action: reading profiles off disk
      // is async, but the pipeline's contract is synchronous and nothing
      // downstream waits on the result.
      void this.#switchProfile(action.command === 'next' ? 1 : -1);
      return { status: 'executed', by: 'kiyro-pipeline' };
    }

    if (action.type === 'discord') {
      // Also fire-and-forget: connecting (and, the very first time, the
      // Discord consent prompt) is async, and a bound key must return
      // immediately the same as every other binding does.
      void this.#runDiscordCommand(action);
      return { status: 'executed', by: 'kiyro-pipeline' };
    }

    return nativeActionExecutor.execute({ controlId, action, at });
  }

  async #runDiscordCommand(action: Extract<Action, { type: 'discord' }>): Promise<void> {
    try {
      switch (action.command) {
        case 'toggleMute':
          await discordRpcClient.toggleMute();
          break;
        case 'toggleDeafen':
          await discordRpcClient.toggleDeafen();
          break;
        case 'micVolumeUp':
          await discordRpcClient.adjustMicVolume(1, action.step ?? 10);
          break;
        case 'micVolumeDown':
          await discordRpcClient.adjustMicVolume(-1, action.step ?? 10);
          break;
      }
    } catch (error) {
      // Never surfaced beyond the log — most likely cause is simply "Discord
      // isn't running right now," which is a normal, expected state (not
      // every key press happens while voice-chatting), not a Kiyro error.
      console.error(`[kiyro] discord ${action.command} failed:`, error);
    }
  }

  /**
   * Cycles the active profile by `direction`, wrapping at both ends.
   *
   * Done here in the main process rather than by asking the renderer, so
   * profile switching works exactly like every other binding does: with the
   * window closed, hidden, or never opened at all. Disk is the source of
   * truth (it is what the renderer saves to), and the renderer is told
   * afterwards purely so its UI follows along.
   */
  async #switchProfile(direction: 1 | -1): Promise<void> {
    const profiles = await electronProfileStorage.list();
    if (profiles.length < 2) {
      console.log(`[kiyro] profile switch ignored: ${profiles.length} profile(s) saved`);
      return;
    }

    const currentId = this.profiles.profileId ?? (await electronProfileStorage.getActiveProfileId());
    const index = profiles.findIndex((profile) => profile.id === currentId);
    // An unknown current profile starts the cycle from the first entry rather
    // than failing — `-1 + 1` would otherwise land on index 0 by accident for
    // 'next' and off the end for 'previous'.
    const from = index >= 0 ? index : 0;
    const next = profiles[(from + direction + profiles.length) % profiles.length];
    if (!next || next.id === currentId) return;

    this.setActiveProfile({
      profileId: next.id,
      updatedAt: next.updatedAt,
      bindings: next.bindings,
    });
    await electronProfileStorage.setActiveProfileId(next.id);

    console.log(`[kiyro] profile switched to '${next.name}' (${next.id})`);
    this.#send(IpcChannel.ActiveProfileChanged, { profileId: next.id });
    this.#notifyProfileSwitched(next.name);
  }

  /**
   * A native Windows toast — the one piece of feedback that a `profile`
   * binding did something even with Kiyro's window closed or hidden, which
   * is the normal way this action gets used (see `#switchProfile`'s own
   * comment: it works specifically so the window doesn't need to be open).
   * Without this, cycling profiles from the pad while the window is hidden
   * has no visible effect at all.
   *
   * `isSupported()` is what keeps this a no-op rather than a thrown error on
   * a machine where Windows notifications are unavailable (disabled in
   * Focus Assist settings, or — for `mac`/`linux` builds later — before
   * permission has been granted).
   */
  #notifyProfileSwitched(name: string): void {
    if (!Notification.isSupported()) return;

    // `silent: true`: this action exists partly *for* cycling quickly (a
    // "previous"/"next" pair on adjacent keys), and Windows' own toast sound
    // firing on every tap would get old fast. The toast itself is still the
    // point — it's the only feedback loop this action has.
    new Notification({
      title: 'Kiyro',
      body: `Switched to "${name}"`,
      icon: NOTIFICATION_ICON_PATH,
      silent: true,
    }).show();
  }

  #send(channel: string, payload: unknown): void {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }
}
