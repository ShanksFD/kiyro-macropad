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

import type { BrowserWindow } from 'electron';
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
import { nativeActionExecutor } from './native-execution';
import { electronProfileStorage } from './profile-storage';
import { SerialBridge } from './serial-bridge';

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
   * `profile` actions are Kiyro reconfiguring itself, not an OS-level
   * keystroke — they need the profile list and change this process's own
   * state, neither of which the stateless `nativeActionExecutor` has. So they
   * are intercepted here and everything else passes straight through.
   */
  #execute(controlId: string, action: Action, at: number): ExecutionOutcome {
    if (action.type === 'profile') {
      // Fire-and-forget, like every other action: reading profiles off disk
      // is async, but the pipeline's contract is synchronous and nothing
      // downstream waits on the result.
      void this.#switchProfile(action.command === 'next' ? 1 : -1);
      return { status: 'executed', by: 'kiyro-pipeline' };
    }

    return nativeActionExecutor.execute({ controlId, action, at });
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
  }

  #send(channel: string, payload: unknown): void {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }
}
