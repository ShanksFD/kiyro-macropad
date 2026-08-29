import { InboundPrefix, InboundToken } from './constants';
import type { DeviceEvent } from './types';

/**
 * Reassembles serial chunks into complete lines.
 *
 * A single `read()` from a serial port carries an arbitrary slice of the stream:
 * `"BTN:2\r\nRIG"` followed by `"HT\r\n"` must produce `BTN:2` then `RIGHT`.
 */
export class LineBuffer {
  #pending = '';

  /** Hard cap so a device that never emits a newline cannot grow the buffer forever. */
  static readonly MAX_PENDING = 4096;

  push(chunk: string): string[] {
    this.#pending += chunk;

    if (this.#pending.length > LineBuffer.MAX_PENDING) {
      // Drop the unterminated garbage rather than leak memory; resynchronise on
      // the next newline.
      this.#pending = this.#pending.slice(-LineBuffer.MAX_PENDING);
    }

    const parts = this.#pending.split(/\r\n|\n|\r/);
    this.#pending = parts.pop() ?? '';

    return parts.map((line) => line.trim()).filter((line) => line.length > 0);
  }

  /** Returns and clears whatever is buffered but not yet newline-terminated. */
  flush(): string[] {
    const remainder = this.#pending.trim();
    this.#pending = '';
    return remainder.length > 0 ? [remainder] : [];
  }

  reset(): void {
    this.#pending = '';
  }
}

const parseCode = (value: string): number | null => {
  if (!/^\d+$/.test(value)) return null;
  const code = Number.parseInt(value, 10);
  return Number.isSafeInteger(code) ? code : null;
};

/**
 * Lines that are not part of the documented protocol but appear on every
 * reset: the ESP32's ROM bootloader banner, printed before the application
 * even starts (e.g. `ESP-ROM:esp32c3-...`, `Build:...`, `rst:0x1 ...`). Not a
 * bug to work around — recognised so a device reset does not show up as a
 * wall of `unknown` events.
 */
const BOOT_BANNER_PREFIXES = [
  'ESP-ROM:',
  'Build:',
  'rst:',
  'Saved PC:',
  'SPIWP:',
  'mode:',
  'load:',
  'entry ',
] as const;

export function isBootBanner(line: string): boolean {
  return BOOT_BANNER_PREFIXES.some((prefix) => line.startsWith(prefix));
}

/**
 * Decodes one already-framed line into a typed event.
 *
 * Unrecognised but well-formed lines become `{ type: 'unknown' }` instead of
 * throwing — firmware is allowed to be chattier than the host understands.
 */
export function parseDeviceMessage(line: string): DeviceEvent {
  const raw = line.trim();

  switch (raw) {
    case InboundToken.Ready:
      return { type: 'ready' };
    case InboundToken.Pong:
      return { type: 'pong' };
    case InboundToken.EncoderOneLeft:
      return { type: 'encoder', encoder: 1, direction: 'ccw' };
    case InboundToken.EncoderOneRight:
      return { type: 'encoder', encoder: 1, direction: 'cw' };
    case InboundToken.EncoderTwoLeft:
      return { type: 'encoder', encoder: 2, direction: 'ccw' };
    case InboundToken.EncoderTwoRight:
      return { type: 'encoder', encoder: 2, direction: 'cw' };
    default:
      break;
  }

  const separator = raw.indexOf(':');
  if (separator > 0) {
    const prefix = raw.slice(0, separator);
    const code = parseCode(raw.slice(separator + 1).trim());

    if (code !== null) {
      switch (prefix) {
        case InboundPrefix.Button:
          return { type: 'button', code };
        case InboundPrefix.EncoderButton:
          return { type: 'encoderButton', code };
        case InboundPrefix.LongPress:
          return { type: 'longPress', code };
        default:
          break;
      }
    }
  }

  return { type: 'unknown', raw };
}

/** Convenience for tests and mock transports: chunk -> typed events. */
export function createEventDecoder(): (chunk: string) => DeviceEvent[] {
  const buffer = new LineBuffer();
  return (chunk) => buffer.push(chunk).map(parseDeviceMessage);
}
