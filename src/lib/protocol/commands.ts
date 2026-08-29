import { COMMAND_TERMINATOR, HANDSHAKE_TIMEOUT_MS, OutboundCommand } from './constants';
import type { DeviceEvent, DeviceEventType } from './types';

export interface ProtocolChannel {
  /** Writes a single command line, terminator included. */
  send(line: string): Promise<void>;
  /** Resolves with the next event matching any of `types`, or rejects on timeout. */
  waitFor(types: DeviceEventType[], timeoutMs: number): Promise<DeviceEvent>;
}

/**
 * Typed command surface.
 *
 * Only `HELLO` and `PING` exist, because they are the only commands the
 * firmware implements. Configuration lives on the host (see
 * `docs/device-protocol.md`), so there is deliberately nothing here that writes
 * a configuration to the device.
 */
export class DeviceProtocol {
  constructor(private readonly channel: ProtocolChannel) {}

  async hello(timeoutMs = HANDSHAKE_TIMEOUT_MS): Promise<void> {
    await this.channel.send(`${OutboundCommand.Hello}${COMMAND_TERMINATOR}`);
    await this.channel.waitFor(['ready'], timeoutMs);
  }

  async ping(timeoutMs = HANDSHAKE_TIMEOUT_MS): Promise<number> {
    const startedAt = performance.now();
    await this.channel.send(`${OutboundCommand.Ping}${COMMAND_TERMINATOR}`);
    await this.channel.waitFor(['pong'], timeoutMs);
    return Math.round(performance.now() - startedAt);
  }
}
