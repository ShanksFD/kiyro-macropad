import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeviceSession } from '@/lib/serial/device-session';
import { MockSerialTransport } from '@/lib/serial/mock-serial-transport';
import type { SerialTransport } from '@/lib/serial/transport';
import { ESP32C3_MACROPAD } from '@/lib/devices/esp32c3-macropad';
import { resolveEvent } from '@/lib/devices/registry';
import { actionExecutor, BrowserSandboxExecutor } from '@/lib/execution/executor';
import { LocalConfigurationRepository } from '@/lib/storage/configuration-repository';
import { createProfile } from '@/lib/profiles/factory';
import type { BindingMap } from '@/lib/actions/types';
import type { DeviceEvent } from '@/lib/protocol/types';

const device = ESP32C3_MACROPAD;

/** Records everything written to the port so we can assert what was *not* sent. */
class RecordingTransport extends MockSerialTransport {
  readonly written: string[] = [];

  override async write(payload: string): Promise<void> {
    this.written.push(payload.trim());
    await super.write(payload);
  }
}

const sessions: DeviceSession[] = [];

async function connect(transport: SerialTransport): Promise<DeviceSession> {
  const session = new DeviceSession(() => transport);
  sessions.push(session);
  await session.connect({ simulated: true });
  return session;
}

afterEach(async () => {
  while (sessions.length > 0) await sessions.pop()?.disconnect();
});

describe('factory firmware connection', () => {
  it('connects on the handshake alone', async () => {
    const session = await connect(new MockSerialTransport());

    expect(session.state.status).toBe('connected');
    expect(session.state.error).toBeNull();
    expect(session.state.device?.id).toBe(device.id);
  });

  it('never sends a configuration command', async () => {
    const transport = new RecordingTransport();
    const session = await connect(transport);

    transport.emitButton(21);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await session.disconnect();

    // The factory firmware would ignore these, and asking would be inventing a
    // protocol the hardware does not have.
    expect(transport.written).toEqual(['HELLO', 'PING']);
    for (const command of ['GET_CONFIG', 'SET_CONFIG', 'SAVE_CONFIG', 'RESET_CONFIG']) {
      expect(transport.written.join(' ')).not.toContain(command);
    }
  });

  it('delivers button and encoder events to the event layer', async () => {
    const transport = new MockSerialTransport();
    const session = await connect(transport);
    const events: DeviceEvent[] = [];
    session.onEvent((event) => events.push(event));

    transport.emitButton(21); // key 1
    transport.emitButton(5); // key 12
    transport.emitEncoder(1, 'ccw');
    transport.emitEncoder(2, 'cw');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events.map((event) => resolveEvent(device, event))).toEqual([
      { status: 'mapped', controlId: 'button-1' },
      { status: 'mapped', controlId: 'button-12' },
      { status: 'mapped', controlId: 'encoder-1-ccw' },
      { status: 'mapped', controlId: 'encoder-2-cw' },
    ]);
  });
});

describe('host execution', () => {
  it('is modelled as unavailable in a browser, and never faked', () => {
    const availability = actionExecutor.availability();

    expect(availability.available).toBe(false);
    if (!availability.available) expect(availability.reason).toBe('browser-sandbox');
  });

  it('reports every action as unavailable rather than executed', () => {
    const executor = new BrowserSandboxExecutor();

    const outcome = executor.execute({
      controlId: 'button-1',
      action: { type: 'keyboard', key: 'KeyA' },
      at: Date.now(),
    });

    expect(outcome.status).toBe('unavailable');
    expect(
      executor.execute({ controlId: 'button-2', action: { type: 'none' }, at: Date.now() }),
    ).toEqual({ status: 'skipped', reason: 'no-binding' });
  });
});

describe('local profile persistence', () => {
  const repository = new LocalConfigurationRepository();

  beforeEach(() => {
    // Minimal Storage stand-in: the repository is the only thing that touches it.
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    Object.assign(globalThis, { window: { localStorage: storage } });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('keeps a saved profile across reloads and reconnects', async () => {
    const bindings: BindingMap = { 'button-1': { type: 'keyboard', key: 'KeyA' } };
    const profile = createProfile({ name: 'Work', deviceId: device.id, bindings });

    await repository.save(profile);
    repository.setActiveProfileId(profile.id);

    // A reload or a device reconnect creates a new repository over the same
    // storage; nothing about persistence depends on the device being present.
    const afterReload = new LocalConfigurationRepository();
    const [restored] = await afterReload.list();

    expect(restored?.bindings['button-1']).toEqual({ type: 'keyboard', key: 'KeyA' });
    expect(afterReload.getActiveProfileId()).toBe(profile.id);
  });

  it('drops stored data that does not validate', async () => {
    globalThis.window.localStorage.setItem('kiyro.profiles.v1', '[{"name":"broken"}]');

    expect(await repository.list()).toEqual([]);
  });
});
