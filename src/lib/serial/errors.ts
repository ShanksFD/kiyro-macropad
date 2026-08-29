/**
 * Domain errors for the device layer.
 *
 * Raw `DOMException`s from the Web Serial API are never shown to users — every
 * failure is mapped onto one of these and rendered through `message`.
 */

export abstract class KiyroDeviceError extends Error {
  abstract readonly code: string;
  /** Short, actionable copy safe to render in the UI. */
  abstract readonly userMessage: string;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class DeviceNotSupportedError extends KiyroDeviceError {
  readonly code = 'device/not-supported';
  readonly userMessage =
    'Device configuration requires the Web Serial API. Use Chrome or Edge on desktop.';
}

export class DeviceConnectionError extends KiyroDeviceError {
  readonly code = 'device/connection-failed';
  constructor(
    readonly userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(userMessage, options);
  }
}

export class DevicePortBusyError extends KiyroDeviceError {
  readonly code = 'device/port-busy';
  readonly userMessage =
    'Could not open the macro pad. Make sure it is plugged in and not open in another application, such as a serial monitor.';
}

export class DeviceProtocolError extends KiyroDeviceError {
  readonly code = 'device/protocol';
  constructor(
    readonly userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(userMessage, options);
  }
}

export class DeviceTimeoutError extends KiyroDeviceError {
  readonly code = 'device/timeout';
  readonly userMessage =
    'The macro pad did not answer in time. Unplug it, plug it back in, and try again.';
}

export class DeviceDisconnectedError extends KiyroDeviceError {
  readonly code = 'device/disconnected';
  readonly userMessage = 'The macro pad was disconnected.';
}

export class InvalidConfigurationError extends KiyroDeviceError {
  readonly code = 'config/invalid';
  constructor(
    readonly userMessage: string,
    readonly details: string[] = [],
  ) {
    super(userMessage);
  }
}

/** The user dismissed the browser's serial port picker — not an error worth surfacing. */
export class PortSelectionCancelledError extends KiyroDeviceError {
  readonly code = 'device/selection-cancelled';
  readonly userMessage = 'No device selected.';
}

/**
 * Translates anything thrown by the Web Serial API into a domain error.
 *
 * Chromium reports most failure modes as a `DOMException` whose `name` is the
 * only reliable discriminator; the message text is not stable across versions.
 */
export function toDeviceError(error: unknown): KiyroDeviceError {
  if (error instanceof KiyroDeviceError) return error;

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    switch (error.name) {
      case 'NotFoundError':
        return new PortSelectionCancelledError('Port selection cancelled');
      case 'InvalidStateError':
      case 'NetworkError':
        return new DevicePortBusyError('Serial port already in use');
      case 'SecurityError':
        return new DeviceConnectionError(
          'The browser blocked access to the serial port. Serial access requires a secure (https or localhost) page.',
          { cause: error },
        );
      case 'BreakError':
      case 'FramingError':
      case 'ParityError':
      case 'BufferOverrunError':
        return new DeviceProtocolError(
          'The connection to the macro pad became unstable. Try reconnecting.',
          { cause: error },
        );
      default:
        break;
    }
  }

  return new DeviceConnectionError('Could not communicate with the macro pad.', { cause: error });
}

export function describeError(error: unknown): string {
  return toDeviceError(error).userMessage;
}
