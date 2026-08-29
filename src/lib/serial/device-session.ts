import { DeviceProtocol } from '../protocol/commands';
import { HANDSHAKE_TIMEOUT_MS } from '../protocol/constants';
import { LineBuffer, parseDeviceMessage } from '../protocol/parser';
import type { DeviceEvent, DeviceEventType, SerialFrame } from '../protocol/types';
import { allSerialFilters, DEFAULT_DEVICE, matchDevice } from '../devices/registry';
import type { DeviceDefinition } from '../devices/types';
import { Listeners } from './emitter';
import {
  DeviceTimeoutError,
  KiyroDeviceError,
  PortSelectionCancelledError,
  toDeviceError,
} from './errors';
import { MockSerialTransport } from './mock-serial-transport';
import type { PortInfo, SerialTransport, TransportCloseReason } from './transport';
import { isWebSerialSupported, WebSerialTransport } from './web-serial-transport';

export type ConnectionStatus =
  'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface DeviceSessionState {
  status: ConnectionStatus;
  device: DeviceDefinition | null;
  portInfo: PortInfo | null;
  transport: 'webserial' | 'mock' | null;
  /** User-facing error copy; never a raw exception message. */
  error: string | null;
  /** Round-trip time of the last successful ping, in milliseconds. */
  latencyMs: number | null;
  connectedAt: number | null;
}

const INITIAL_STATE: DeviceSessionState = {
  status: 'disconnected',
  device: null,
  portInfo: null,
  transport: null,
  error: null,
  latencyMs: null,
  connectedAt: null,
};

interface Waiter {
  types: DeviceEventType[];
  resolve: (event: DeviceEvent) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Creates the transport for a connection attempt. Overridable for tests. */
export type TransportFactory = (simulated: boolean) => SerialTransport;

const defaultTransportFactory: TransportFactory = (simulated) =>
  simulated ? new MockSerialTransport() : new WebSerialTransport({ filters: allSerialFilters() });

/**
 * Owns the whole device lifecycle: transport, framing, handshake and events.
 *
 * Deliberately framework-free and instantiated once (`deviceSession`) so serial
 * traffic never drives React re-renders directly — stores subscribe to it and
 * decide what is worth rendering.
 */
export class DeviceSession {
  constructor(private readonly createTransport: TransportFactory = defaultTransportFactory) {}

  #transport: SerialTransport | null = null;
  #protocol: DeviceProtocol | null = null;
  #buffer = new LineBuffer();
  #state: DeviceSessionState = INITIAL_STATE;
  #waiters: Waiter[] = [];
  #frameId = 0;
  #unsubscribers: Array<() => void> = [];

  readonly #stateListeners = new Listeners<DeviceSessionState>();
  readonly #eventListeners = new Listeners<DeviceEvent>();
  readonly #frameListeners = new Listeners<SerialFrame>();

  get state(): DeviceSessionState {
    return this.#state;
  }

  get protocol(): DeviceProtocol | null {
    return this.#protocol;
  }

  /** The live mock, when the session is running in simulated mode. */
  get mock(): MockSerialTransport | null {
    return this.#transport instanceof MockSerialTransport ? this.#transport : null;
  }

  onStateChange(listener: (state: DeviceSessionState) => void): () => void {
    return this.#stateListeners.add(listener);
  }

  onEvent(listener: (event: DeviceEvent) => void): () => void {
    return this.#eventListeners.add(listener);
  }

  onFrame(listener: (frame: SerialFrame) => void): () => void {
    return this.#frameListeners.add(listener);
  }

  isSupported(): boolean {
    return isWebSerialSupported();
  }

  #patch(patch: Partial<DeviceSessionState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#stateListeners.emit(this.#state);
  }

  /**
   * Full connect flow: pick port, open, handshake, then start listening.
   *
   * A port that opens but never answers `HELLO` is *not* a connected device —
   * the port is closed again and the session returns to a clean state.
   */
  async connect(options: { simulated?: boolean; reuseGrantedPort?: boolean } = {}): Promise<void> {
    if (this.#state.status === 'connecting' || this.#state.status === 'connected') return;

    const simulated = options.simulated ?? false;

    if (!simulated && !this.isSupported()) {
      this.#patch({ status: 'unsupported', error: null });
      return;
    }

    this.#patch({ status: 'connecting', error: null, transport: simulated ? 'mock' : 'webserial' });

    const transport = this.createTransport(simulated);

    try {
      if (options.reuseGrantedPort && transport instanceof WebSerialTransport) {
        // Reconnecting without a user gesture only works for a port the user
        // has already authorised in this browser profile.
        const restored = await transport.restoreGrantedPort();
        if (!restored) {
          this.#patch({ status: 'disconnected', transport: null });
          return;
        }
      } else {
        await transport.requestPort();
      }
      await transport.open();

      this.#attach(transport);
      await this.#handshake();

      const portInfo = transport.getPortInfo();
      const device = (portInfo ? matchDevice(portInfo) : undefined) ?? DEFAULT_DEVICE;

      this.#patch({
        status: 'connected',
        device,
        portInfo,
        error: null,
        connectedAt: Date.now(),
      });
    } catch (error) {
      const deviceError = toDeviceError(error);
      this.#detach();
      await transport.close('user').catch(() => undefined);

      if (deviceError instanceof PortSelectionCancelledError) {
        this.#patch({ status: 'disconnected', error: null, transport: null });
        return;
      }

      this.#patch({
        status: 'error',
        error: deviceError.userMessage,
        device: null,
        portInfo: null,
        connectedAt: null,
      });
      throw deviceError;
    }
  }

  #attach(transport: SerialTransport): void {
    this.#transport = transport;
    this.#buffer.reset();
    this.#protocol = new DeviceProtocol({
      send: (line) => this.#send(line),
      waitFor: (types, timeoutMs) => this.#waitFor(types, timeoutMs),
    });

    this.#unsubscribers = [
      transport.onData((chunk) => this.#ingest(chunk)),
      transport.onClose((reason) => this.#handleClose(reason)),
    ];
  }

  #detach(): void {
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
    this.#unsubscribers = [];
    this.#rejectWaiters(new DeviceTimeoutError('Connection closed while awaiting a reply'));
    this.#transport = null;
    this.#protocol = null;
    this.#buffer.reset();
  }

  async #handshake(): Promise<void> {
    if (!this.#protocol) throw new DeviceTimeoutError('No protocol channel');
    await this.#protocol.hello(HANDSHAKE_TIMEOUT_MS);
    const latencyMs = await this.#protocol.ping(HANDSHAKE_TIMEOUT_MS);
    this.#patch({ latencyMs });
  }

  #ingest(chunk: string): void {
    for (const line of this.#buffer.push(chunk)) {
      const event = parseDeviceMessage(line);
      this.#emitFrame({ direction: 'rx', raw: line, event });

      // Handshake replies are consumed by whoever is waiting; they are still
      // published so the debug console shows the complete stream.
      this.#settleWaiters(event);
      this.#eventListeners.emit(event);
    }
  }

  #emitFrame(frame: Omit<SerialFrame, 'id' | 'at'>): void {
    this.#frameId += 1;
    this.#frameListeners.emit({ ...frame, id: this.#frameId, at: Date.now() });
  }

  async #send(line: string): Promise<void> {
    if (!this.#transport) throw new DeviceTimeoutError('Not connected');
    this.#emitFrame({ direction: 'tx', raw: line.trim() });
    await this.#transport.write(line);
  }

  #waitFor(types: DeviceEventType[], timeoutMs: number): Promise<DeviceEvent> {
    return new Promise<DeviceEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters = this.#waiters.filter((waiter) => waiter.timer !== timer);
        reject(new DeviceTimeoutError(`Timed out waiting for ${types.join(' or ')}`));
      }, timeoutMs);

      this.#waiters.push({ types, resolve, reject, timer });
    });
  }

  #settleWaiters(event: DeviceEvent): void {
    const index = this.#waiters.findIndex((waiter) => waiter.types.includes(event.type));
    if (index < 0) return;

    const [waiter] = this.#waiters.splice(index, 1);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    waiter.resolve(event);
  }

  #rejectWaiters(error: Error): void {
    for (const waiter of this.#waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.#waiters = [];
  }

  #handleClose(reason: TransportCloseReason): void {
    this.#detach();
    this.#patch({
      status: reason === 'user' ? 'disconnected' : 'error',
      error:
        reason === 'user'
          ? null
          : 'The macro pad was disconnected. Your changes are still here — reconnect when you are ready.',
      portInfo: null,
      connectedAt: null,
      latencyMs: null,
      transport: null,
    });
  }

  async disconnect(): Promise<void> {
    const transport = this.#transport;
    this.#detach();
    await transport?.close('user').catch(() => undefined);
    this.#patch({ ...INITIAL_STATE });
  }

  async reconnect(): Promise<void> {
    const simulated = this.#state.transport === 'mock';
    await this.disconnect();
    this.#patch({ status: 'reconnecting' });
    await this.connect({ simulated });
  }

  /** Manual keep-alive used by the debug panel. */
  async ping(): Promise<number | null> {
    if (!this.#protocol || this.#state.status !== 'connected') return null;
    try {
      const latencyMs = await this.#protocol.ping();
      this.#patch({ latencyMs });
      return latencyMs;
    } catch (error) {
      const deviceError = error instanceof KiyroDeviceError ? error : toDeviceError(error);
      this.#patch({ error: deviceError.userMessage });
      return null;
    }
  }
}

/** Application-wide singleton. */
export const deviceSession = new DeviceSession();
