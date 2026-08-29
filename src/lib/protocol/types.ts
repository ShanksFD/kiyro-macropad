/** Rotation direction as reported by the hardware. */
export type EncoderDirection = 'cw' | 'ccw';

/** Which physical encoder a rotation belongs to (1-based, matches the device labels). */
export type EncoderIndex = 1 | 2;

/**
 * A decoded device message.
 *
 * This is the *only* representation of device input the rest of the application
 * is allowed to consume — raw strings such as `"BTN:21"` never leave the
 * protocol layer.
 */
export type DeviceEvent =
  | { type: 'ready' }
  | { type: 'pong' }
  | { type: 'button'; code: number }
  | { type: 'encoder'; encoder: EncoderIndex; direction: EncoderDirection }
  | { type: 'encoderButton'; code: number }
  | { type: 'longPress'; code: number }
  /** A well-formed line the current protocol version does not understand. */
  | { type: 'unknown'; raw: string };

export type DeviceEventType = DeviceEvent['type'];

/** A single framed line of serial traffic, kept for the debug console. */
export interface SerialFrame {
  id: number;
  /** Epoch milliseconds. */
  at: number;
  direction: 'rx' | 'tx';
  raw: string;
  /** Present for `rx` frames only. */
  event?: DeviceEvent;
}
