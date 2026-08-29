import { COMMAND_TERMINATOR, InboundPrefix, InboundToken } from './constants';
import type { OutboundCommand } from './constants';
import type { DeviceEvent } from './types';

/**
 * Renders a decoded event back into the exact line the firmware would have sent.
 *
 * Used by test mode and the mock transport; keeping it next to the parser means
 * the wire format is described in exactly one place.
 */
export function encodeEvent(event: DeviceEvent): string {
  switch (event.type) {
    case 'ready':
      return InboundToken.Ready;
    case 'pong':
      return InboundToken.Pong;
    case 'button':
      return `${InboundPrefix.Button}:${event.code}`;
    case 'encoderButton':
      return `${InboundPrefix.EncoderButton}:${event.code}`;
    case 'longPress':
      return `${InboundPrefix.LongPress}:${event.code}`;
    case 'encoder':
      if (event.encoder === 1) {
        return event.direction === 'cw'
          ? InboundToken.EncoderOneRight
          : InboundToken.EncoderOneLeft;
      }
      return event.direction === 'cw' ? InboundToken.EncoderTwoRight : InboundToken.EncoderTwoLeft;
    default:
      return event.raw;
  }
}

/** Frames a command for transmission. */
export function encodeCommand(command: OutboundCommand): string {
  return `${command}${COMMAND_TERMINATOR}`;
}
