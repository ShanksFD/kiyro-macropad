/**
 * Owns the real serial connection to the ESP32-C3, in Electron's main
 * process. Renderer code never touches this directly — only `window.kiyro`,
 * via `preload.ts` and `ipc-handlers.ts`.
 *
 * Reuses the framework-free protocol layer unchanged: `LineBuffer`/
 * `parseDeviceMessage`/`isBootBanner` (`@/lib/protocol/parser.ts`),
 * `HANDSHAKE_TIMEOUT_MS` (`@/lib/protocol/constants.ts`), `matchDevice`/
 * `DEFAULT_DEVICE` (`@/lib/devices/registry.ts`). The handshake and retry
 * behaviour mirror `DeviceSession` (browser) and `device_watcher.py` (the
 * proven Python reference) exactly: HELLO -> READY, then PING -> PONG; a port
 * that opens but never answers is not treated as connected.
 */

import { SerialPort } from 'serialport';
import { HANDSHAKE_TIMEOUT_MS } from '../src/lib/protocol/constants';
import { isBootBanner, LineBuffer, parseDeviceMessage } from '../src/lib/protocol/parser';
import type { DeviceEvent } from '../src/lib/protocol/types';
import { DEFAULT_DEVICE, matchDevice } from '../src/lib/devices/registry';
import { Listeners } from '../src/lib/serial/emitter';
import type { PortInfo } from '../src/lib/serial/transport';
import type { ConnectionStatus } from '../src/lib/serial/device-session';

const BAUD_RATE = 115_200;
const RETRY_DELAY_MS = 1500;

export interface SerialBridgeState {
  status: ConnectionStatus;
  deviceId: string | null;
  portInfo: PortInfo | null;
  error: string | null;
  latencyMs: number | null;
}

const INITIAL_STATE: SerialBridgeState = {
  status: 'disconnected',
  deviceId: null,
  portInfo: null,
  error: null,
  latencyMs: null,
};

function toPortInfo(port: { vendorId?: string; productId?: string; path: string }): PortInfo {
  return {
    vendorId: port.vendorId ? Number.parseInt(port.vendorId, 16) : undefined,
    productId: port.productId ? Number.parseInt(port.productId, 16) : undefined,
    label: port.path,
  };
}

async function findFactoryPort(explicitPath?: string): Promise<string | null> {
  if (explicitPath) return explicitPath;

  const ports = await SerialPort.list();
  const match = ports.find((port) => {
    const info = toPortInfo(port);
    return matchDevice(info) !== undefined;
  });
  return match?.path ?? null;
}

function waitForLine(
  buffer: LineBuffer,
  port: SerialPort,
  expected: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      port.off('data', onData);
      reject(new Error(`Timed out waiting for ${expected}`));
    }, timeoutMs);

    function onData(chunk: Buffer) {
      for (const line of buffer.push(chunk.toString('utf-8'))) {
        if (isBootBanner(line)) continue;
        if (line === expected) {
          clearTimeout(timer);
          port.off('data', onData);
          resolve();
          return;
        }
      }
    }

    port.on('data', onData);
  });
}

/**
 * Runs the connect/handshake/read/retry loop for one logical connection. A
 * fresh instance is created per `start()` call so a prior port's listeners
 * can never leak into the next attempt.
 */
export class SerialBridge {
  #state: SerialBridgeState = INITIAL_STATE;
  #port: SerialPort | null = null;
  #buffer = new LineBuffer();
  #stopped = true;
  #running = false;
  #explicitPath: string | undefined;

  readonly #stateListeners = new Listeners<SerialBridgeState>();
  readonly #eventListeners = new Listeners<DeviceEvent>();

  get state(): SerialBridgeState {
    return this.#state;
  }

  onStateChange(listener: (state: SerialBridgeState) => void): () => void {
    return this.#stateListeners.add(listener);
  }

  onEvent(listener: (event: DeviceEvent) => void): () => void {
    return this.#eventListeners.add(listener);
  }

  #patch(patch: Partial<SerialBridgeState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#stateListeners.emit(this.#state);
  }

  /**
   * Starts the connect/retry loop. A no-op if it is already running — the
   * renderer's Connect button and any auto-reconnect effect can both call
   * this without racing two loops for the same port.
   */
  start(explicitPath?: string): void {
    if (this.#running) return;
    this.#running = true;
    this.#stopped = false;
    this.#explicitPath = explicitPath;
    void this.#loop();
  }

  stop(): void {
    this.#stopped = true;
    this.#running = false;
    this.#closePort();
    this.#patch({ ...INITIAL_STATE });
  }

  async #loop(): Promise<void> {
    console.log('[kiyro] looking for the macro pad (VID 0x303A / PID 0x1001)...');
    let loggedPortList = false;

    while (!this.#stopped) {
      let path: string | null;
      try {
        path = await findFactoryPort(this.#explicitPath);
        if (!path && !loggedPortList) {
          // Logged once, not every retry: shows exactly what Windows/`serialport`
          // sees, so a VID/PID or driver mismatch is visible instead of just
          // looking like nothing is happening.
          loggedPortList = true;
          const ports = await SerialPort.list();
          console.log(
            `[kiyro] no matching port yet. Ports seen: ${
              ports.length === 0
                ? '(none)'
                : ports.map((p) => `${p.path} (VID ${p.vendorId ?? '?'} / PID ${p.productId ?? '?'})`).join(', ')
            }`,
          );
        }
      } catch (error) {
        // A `SerialPort.list()` failure (e.g. a native-module load problem)
        // must never look identical to "no pad plugged in" — that would be
        // silently unrecoverable.
        console.error('[kiyro] could not list serial ports:', error);
        this.#patch({
          status: 'error',
          error: error instanceof Error ? error.message : 'Could not list serial ports.',
        });
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      if (!path) {
        if (this.#state.status !== 'disconnected') this.#patch({ status: 'disconnected', error: null });
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      loggedPortList = false; // a real port turned up; the next "not found" streak deserves its own log

      try {
        await this.#connectAndServe(path);
      } catch (error) {
        console.error(`[kiyro] ${path}:`, error);
        this.#patch({
          status: 'error',
          error: error instanceof Error ? error.message : 'Could not communicate with the macro pad.',
        });
        this.#closePort();
      }

      if (!this.#stopped) await sleep(RETRY_DELAY_MS);
    }
  }

  async #connectAndServe(path: string): Promise<void> {
    console.log(`[kiyro] opening ${path} at ${BAUD_RATE} baud...`);
    this.#patch({ status: 'connecting', error: null });

    const port = new SerialPort({ path, baudRate: BAUD_RATE, autoOpen: false });
    await new Promise<void>((resolve, reject) => port.open((error) => (error ? reject(error) : resolve())));
    this.#port = port;

    const handshakeBuffer = new LineBuffer();
    port.write('HELLO\r\n');
    await waitForLine(handshakeBuffer, port, 'READY', HANDSHAKE_TIMEOUT_MS);

    const pingStart = Date.now();
    port.write('PING\r\n');
    await waitForLine(handshakeBuffer, port, 'PONG', HANDSHAKE_TIMEOUT_MS);
    const latencyMs = Date.now() - pingStart;

    const listPorts = await SerialPort.list();
    const portMeta = listPorts.find((candidate) => candidate.path === path);
    const portInfo = portMeta ? toPortInfo(portMeta) : { label: path };
    const device = matchDevice(portInfo) ?? DEFAULT_DEVICE;

    this.#buffer.reset();
    console.log(`[kiyro] connected on ${path} (HELLO/READY, PING/PONG acknowledged, ${latencyMs}ms)`);
    this.#patch({ status: 'connected', deviceId: device.id, portInfo, error: null, latencyMs });

    await new Promise<void>((resolve) => {
      port.on('data', (chunk: Buffer) => {
        for (const line of this.#buffer.push(chunk.toString('utf-8'))) {
          if (isBootBanner(line)) continue;
          this.#eventListeners.emit(parseDeviceMessage(line));
        }
      });
      port.on('close', () => resolve());
      port.on('error', () => resolve());
    });

    this.#closePort();
    if (!this.#stopped) {
      this.#patch({
        status: 'error',
        error: 'The macro pad was disconnected. Reconnecting…',
        portInfo: null,
        deviceId: null,
        latencyMs: null,
      });
    }
  }

  #closePort(): void {
    if (this.#port && this.#port.isOpen) this.#port.close();
    this.#port = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
