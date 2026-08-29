/**
 * Wire constants for the Kiyro serial protocol.
 *
 * This is the whole protocol the factory firmware speaks: a two-command
 * handshake and a stream of input events. There is no device-side configuration
 * protocol, and Kiyro must not send commands the device cannot answer.
 */

/** Commands the host may send. Both are verified against the factory firmware. */
export const OutboundCommand = {
  Hello: 'HELLO',
  Ping: 'PING',
} as const;
export type OutboundCommand = (typeof OutboundCommand)[keyof typeof OutboundCommand];

/** Bare (argument-less) messages the device sends. */
export const InboundToken = {
  Ready: 'READY',
  Pong: 'PONG',
  EncoderOneLeft: 'LEFT',
  EncoderOneRight: 'RIGHT',
  EncoderTwoLeft: 'LEFT2',
  EncoderTwoRight: 'RIGHT2',
} as const;
export type InboundToken = (typeof InboundToken)[keyof typeof InboundToken];

/** Prefixes for `PREFIX:value` messages. */
export const InboundPrefix = {
  Button: 'BTN',
  EncoderButton: 'ENC_BTN',
  LongPress: 'LONG',
} as const;

/** Every command is terminated with CRLF; the device is tolerant of LF only. */
export const COMMAND_TERMINATOR = '\r\n';

/** Time budget for a handshake reply before the connection is considered dead. */
export const HANDSHAKE_TIMEOUT_MS = 2500;
