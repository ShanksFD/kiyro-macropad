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
import { ActiveProfileStore, resolveControlEvent } from './resolve-control';
import { nativeActionExecutor } from './native-execution';
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
        // TEMP DIAGNOSTIC: exactly which profile (if any) the resolver is
        // actually holding at the moment a physical button fires.
        console.log(
          `[kiyro][diag] button resolved to ${resolution.controlId}; ActiveProfileStore.profileId=${this.profiles.profileId}; binding=${action ? JSON.stringify(action) : 'none'}`,
        );
        if (action) {
          const outcome = nativeActionExecutor.execute({ controlId: resolution.controlId, action, at });
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

  #send(channel: string, payload: unknown): void {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }
}
