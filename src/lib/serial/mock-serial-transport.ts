import {
  COMMAND_TERMINATOR,
  InboundPrefix,
  InboundToken,
  OutboundCommand,
} from '../protocol/constants';
import type { EncoderDirection, EncoderIndex } from '../protocol/types';
import { Listeners } from './emitter';
import type { PortInfo, SerialTransport, TransportCloseReason } from './transport';

export interface MockSerialTransportOptions {
  /** Simulated round-trip latency for handshake replies, in milliseconds. */
  latencyMs?: number;
  portInfo?: PortInfo;
  /** When true the mock never answers HELLO/PING — useful for exercising timeouts. */
  silent?: boolean;
}

/**
 * In-process firmware emulator.
 *
 * Mirrors the verified behaviour of the ESP32-C3 build: it answers `HELLO` with
 * `READY`, `PING` with `PONG`, and can be driven to emit input events. It is
 * deliberately *not* smarter than the real device — anything it does here is
 * behaviour we have actually observed.
 */
export class MockSerialTransport implements SerialTransport {
  readonly kind = 'mock' as const;

  #open = false;
  #selected = false;
  readonly #data = new Listeners<string>();
  readonly #closed = new Listeners<TransportCloseReason>();
  readonly #options: Required<MockSerialTransportOptions>;
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(options: MockSerialTransportOptions = {}) {
    this.#options = {
      latencyMs: options.latencyMs ?? 40,
      portInfo: options.portInfo ?? {
        vendorId: 0x303a,
        productId: 0x1001,
        label: 'Simulated device',
      },
      silent: options.silent ?? false,
    };
  }

  get isOpen(): boolean {
    return this.#open;
  }

  isSupported(): boolean {
    return true;
  }

  async requestPort(): Promise<void> {
    this.#selected = true;
  }

  async open(): Promise<void> {
    this.#selected = true;
    this.#open = true;
  }

  async close(reason: TransportCloseReason = 'user'): Promise<void> {
    if (!this.#open) return;
    this.#open = false;
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    this.#closed.emit(reason);
  }

  async write(payload: string): Promise<void> {
    if (!this.#open) throw new Error('Mock transport is not open');
    if (this.#options.silent) return;

    for (const line of payload.split(/\r\n|\n|\r/)) {
      const command = line.trim();
      if (command.length > 0) this.#handleCommand(command);
    }
  }

  /**
   * One command, one reply.
   *
   * Anything other than the two handshake commands is ignored, exactly as the
   * factory firmware ignores it — a mock that answered more than the hardware
   * does would hide bugs rather than expose them.
   */
  #handleCommand(command: string): void {
    if (command === OutboundCommand.Hello) this.#replyLater(InboundToken.Ready);
    else if (command === OutboundCommand.Ping) this.#replyLater(InboundToken.Pong);
  }

  onData(listener: (chunk: string) => void): () => void {
    return this.#data.add(listener);
  }

  onClose(listener: (reason: TransportCloseReason) => void): () => void {
    return this.#closed.add(listener);
  }

  getPortInfo(): PortInfo | null {
    return this.#selected ? this.#options.portInfo : null;
  }

  // ---------------------------------------------------------------------------
  // Simulation controls (developer tooling only)
  // ---------------------------------------------------------------------------

  /** Pushes a raw line onto the stream exactly as firmware would. */
  emitRaw(line: string): void {
    if (!this.#open) return;
    this.#data.emit(`${line}${COMMAND_TERMINATOR}`);
  }

  emitButton(code: number): void {
    this.emitRaw(`${InboundPrefix.Button}:${code}`);
  }

  emitEncoderButton(code: number): void {
    this.emitRaw(`${InboundPrefix.EncoderButton}:${code}`);
  }

  emitLongPress(code: number): void {
    this.emitRaw(`${InboundPrefix.LongPress}:${code}`);
  }

  emitEncoder(encoder: EncoderIndex, direction: EncoderDirection, steps = 1): void {
    const token =
      encoder === 1
        ? direction === 'cw'
          ? InboundToken.EncoderOneRight
          : InboundToken.EncoderOneLeft
        : direction === 'cw'
          ? InboundToken.EncoderTwoRight
          : InboundToken.EncoderTwoLeft;

    for (let index = 0; index < steps; index += 1) this.emitRaw(token);
  }

  /** Simulates the cable being pulled. */
  simulateUnplug(): void {
    void this.close('device-lost');
  }

  #replyLater(line: string): void {
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      this.emitRaw(line);
    }, this.#options.latencyMs);
    this.#timers.add(timer);
  }
}
