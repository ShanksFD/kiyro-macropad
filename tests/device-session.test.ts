import { afterEach, describe, expect, it } from 'vitest';
import { DeviceSession } from '@/lib/serial/device-session';
import { MockSerialTransport } from '@/lib/serial/mock-serial-transport';
import type { DeviceEvent, SerialFrame } from '@/lib/protocol/types';

const sessions: DeviceSession[] = [];

const openSession = async (): Promise<DeviceSession> => {
  const session = new DeviceSession();
  sessions.push(session);
  await session.connect({ simulated: true });
  return session;
};

afterEach(async () => {
  while (sessions.length > 0) await sessions.pop()?.disconnect();
});

describe('DeviceSession with the mock transport', () => {
  it('completes the HELLO/PING handshake before reporting a connection', async () => {
    const session = await openSession();

    expect(session.state.status).toBe('connected');
    expect(session.state.device?.id).toBe('esp32c3-macropad-v1');
    expect(session.state.transport).toBe('mock');
    expect(session.state.latencyMs).not.toBeNull();
  });

  it('publishes typed events for simulated input', async () => {
    const session = await openSession();
    const events: DeviceEvent[] = [];
    session.onEvent((event) => events.push(event));

    session.mock?.emitButton(21);
    session.mock?.emitEncoder(2, 'ccw', 2);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events).toEqual([
      { type: 'button', code: 21 },
      { type: 'encoder', encoder: 2, direction: 'ccw' },
      { type: 'encoder', encoder: 2, direction: 'ccw' },
    ]);
  });

  it('records both directions of traffic for the debug console', async () => {
    const session = await openSession();
    const frames: SerialFrame[] = [];
    session.onFrame((frame) => frames.push(frame));

    await session.ping();

    expect(frames.map((frame) => `${frame.direction}:${frame.raw}`)).toEqual([
      'tx:PING',
      'rx:PONG',
    ]);
  });

  it('goes back to a clean disconnected state when the device is unplugged', async () => {
    const session = await openSession();
    session.mock?.simulateUnplug();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(session.state.status).toBe('error');
    expect(session.state.error).toContain('disconnected');
    expect(session.state.device).not.toBeNull();
    expect(session.protocol).toBeNull();
  });

  it('refuses to report a connection when the device never answers', async () => {
    // Firmware that opens the port but never speaks: the port must be closed
    // again and the session must not claim to be connected.
    const silent = new MockSerialTransport({ silent: true });
    const session = new DeviceSession(() => silent);
    sessions.push(session);

    await expect(session.connect({ simulated: true })).rejects.toThrow();

    expect(session.state.status).toBe('error');
    expect(session.state.error).toContain('did not answer');
    expect(silent.isOpen).toBe(false);
  }, 10_000);
});
