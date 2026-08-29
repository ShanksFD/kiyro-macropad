/** Identifies where a transport gets its bytes from. */
export type TransportKind = 'webserial' | 'mock';

export interface PortInfo {
  /** USB vendor id, when the platform exposes one. */
  vendorId?: number;
  productId?: number;
  /** Human label such as `COM3`; browsers do not expose this, so it is usually undefined. */
  label?: string;
}

export type TransportCloseReason = 'user' | 'device-lost' | 'read-error';

/**
 * The single seam between the application and the outside world.
 *
 * `WebSerialTransport` talks to real hardware; `MockSerialTransport` emulates
 * the firmware in-process so the whole UI (and the test suite) can run without a
 * physical macro pad.
 */
export interface SerialTransport {
  readonly kind: TransportKind;

  /** Whether this transport can run in the current environment at all. */
  isSupported(): boolean;

  /**
   * Asks the user to pick a port. Must be called from a user gesture in the
   * Web Serial implementation.
   */
  requestPort(): Promise<void>;

  /** Opens the port previously chosen by `requestPort`. */
  open(): Promise<void>;

  close(reason?: TransportCloseReason): Promise<void>;

  /** Queued write; implementations must preserve call order. */
  write(payload: string): Promise<void>;

  /** Subscribe to raw decoded text chunks. Returns an unsubscribe function. */
  onData(listener: (chunk: string) => void): () => void;

  /** Subscribe to unexpected or user-initiated closure. */
  onClose(listener: (reason: TransportCloseReason) => void): () => void;

  getPortInfo(): PortInfo | null;

  readonly isOpen: boolean;
}
