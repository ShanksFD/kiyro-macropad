import { DeviceNotSupportedError, toDeviceError } from './errors';
import { Listeners } from './emitter';
import type { PortInfo, SerialTransport, TransportCloseReason } from './transport';

export interface WebSerialTransportOptions {
  /** Restricts the browser picker to known devices. Empty array shows every port. */
  filters?: SerialPortFilter[];
  baudRate?: number;
}

/** The ESP32-C3 exposes USB CDC; the baud rate is ignored by the device but required by the API. */
const DEFAULT_BAUD_RATE = 115_200;

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Web Serial implementation of {@link SerialTransport}.
 *
 * Owns the reader and writer for the whole lifetime of a connection: nothing
 * else in the app is allowed to call `port.readable` / `port.writable`.
 */
export class WebSerialTransport implements SerialTransport {
  readonly kind = 'webserial' as const;

  #port: SerialPort | null = null;
  #reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  #writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  #readLoop: Promise<void> | null = null;
  /** Serialises writes so command order can never be interleaved. */
  #writeQueue: Promise<void> = Promise.resolve();
  #open = false;
  #closing = false;

  readonly #data = new Listeners<string>();
  readonly #closed = new Listeners<TransportCloseReason>();
  readonly #options: Required<WebSerialTransportOptions>;

  #onPortDisconnect = (event: Event): void => {
    // Fired by the browser when the USB device physically goes away.
    if ((event as { target?: unknown }).target === this.#port) {
      void this.close('device-lost');
    }
  };

  constructor(options: WebSerialTransportOptions = {}) {
    this.#options = {
      filters: options.filters ?? [],
      baudRate: options.baudRate ?? DEFAULT_BAUD_RATE,
    };
  }

  get isOpen(): boolean {
    return this.#open;
  }

  isSupported(): boolean {
    return isWebSerialSupported();
  }

  async requestPort(): Promise<void> {
    if (!this.isSupported()) throw new DeviceNotSupportedError('navigator.serial is unavailable');

    try {
      const port = await navigator.serial.requestPort(
        this.#options.filters.length > 0 ? { filters: this.#options.filters } : {},
      );
      this.#port = port;
    } catch (error) {
      throw toDeviceError(error);
    }
  }

  /** Reuses a port the user already granted permission to, if one matches. */
  async restoreGrantedPort(): Promise<boolean> {
    if (!this.isSupported()) return false;

    const ports = await navigator.serial.getPorts();
    const match = ports.find((port) => this.#matchesFilters(port)) ?? ports[0];
    if (!match) return false;

    this.#port = match;
    return true;
  }

  #matchesFilters(port: SerialPort): boolean {
    if (this.#options.filters.length === 0) return true;
    const info = port.getInfo();
    return this.#options.filters.some(
      (filter) =>
        (filter.usbVendorId === undefined || filter.usbVendorId === info.usbVendorId) &&
        (filter.usbProductId === undefined || filter.usbProductId === info.usbProductId),
    );
  }

  async open(): Promise<void> {
    if (!this.#port) throw new DeviceNotSupportedError('No serial port selected');
    if (this.#open) return;

    try {
      await this.#port.open({ baudRate: this.#options.baudRate });
    } catch (error) {
      throw toDeviceError(error);
    }

    this.#open = true;
    this.#closing = false;
    navigator.serial.addEventListener('disconnect', this.#onPortDisconnect);

    const writable = this.#port.writable;
    if (writable) this.#writer = writable.getWriter();

    this.#readLoop = this.#read();
  }

  async #read(): Promise<void> {
    const readable = this.#port?.readable;
    if (!readable) return;

    const decoder = new TextDecoder();
    this.#reader = readable.getReader();

    try {
      for (;;) {
        const { value, done } = await this.#reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          this.#data.emit(decoder.decode(value, { stream: true }));
        }
      }
    } catch {
      // A read error means the device went away mid-stream.
      if (!this.#closing) void this.close('read-error');
    } finally {
      try {
        this.#reader?.releaseLock();
      } catch {
        /* already released */
      }
      this.#reader = null;
    }
  }

  write(payload: string): Promise<void> {
    const bytes = new TextEncoder().encode(payload);

    this.#writeQueue = this.#writeQueue.then(async () => {
      if (!this.#open || !this.#writer) throw new DeviceNotSupportedError('Port is not open');
      try {
        await this.#writer.write(bytes);
      } catch (error) {
        throw toDeviceError(error);
      }
    });

    return this.#writeQueue;
  }

  async close(reason: TransportCloseReason = 'user'): Promise<void> {
    if (!this.#open || this.#closing) return;
    this.#closing = true;

    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      navigator.serial.removeEventListener('disconnect', this.#onPortDisconnect);
    }

    try {
      await this.#reader?.cancel();
    } catch {
      /* the stream may already be errored */
    }

    await this.#readLoop?.catch(() => undefined);
    this.#readLoop = null;

    try {
      this.#writer?.releaseLock();
    } catch {
      /* already released */
    }
    this.#writer = null;

    try {
      await this.#port?.close();
    } catch {
      /* the port may already be gone after an unplug */
    }

    this.#open = false;
    this.#closing = false;
    this.#closed.emit(reason);
  }

  onData(listener: (chunk: string) => void): () => void {
    return this.#data.add(listener);
  }

  onClose(listener: (reason: TransportCloseReason) => void): () => void {
    return this.#closed.add(listener);
  }

  getPortInfo(): PortInfo | null {
    if (!this.#port) return null;
    const info = this.#port.getInfo();
    return { vendorId: info.usbVendorId, productId: info.usbProductId };
  }
}
