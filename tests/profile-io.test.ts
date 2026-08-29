import { describe, expect, it } from 'vitest';
import { ESP32C3_MACROPAD } from '@/lib/devices/esp32c3-macropad';
import {
  createDefaultProfile,
  createProfile,
  bindingsEqual,
  countAssigned,
} from '@/lib/profiles/factory';
import { parseProfileFile, serializeProfile } from '@/lib/profiles/io';
import { PROFILE_SCHEMA_VERSION } from '@/lib/profiles/types';
import { InvalidConfigurationError } from '@/lib/serial/errors';

const device = ESP32C3_MACROPAD;

describe('profile export / import', () => {
  it('round-trips a profile', () => {
    const profile = createProfile({
      name: 'Work',
      deviceId: device.id,
      bindings: {
        'button-1': { type: 'hotkey', modifiers: ['Control'], key: 'KeyC' },
        'encoder-1-cw': { type: 'volume', command: 'up', step: 2 },
      },
    });

    const { profile: imported } = parseProfileFile(serializeProfile(profile, device), device);

    expect(imported.name).toBe('Work');
    expect(imported.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(bindingsEqual(imported.bindings, profile.bindings)).toBe(true);
    // A fresh id means an import can never silently overwrite an existing profile.
    expect(imported.id).not.toBe(profile.id);
  });

  it('flags a profile authored for another device', () => {
    const profile = createProfile({ name: 'Other', deviceId: 'some-other-pad' });
    const json = JSON.parse(serializeProfile(profile, device)) as Record<string, unknown>;
    json.device = { id: 'some-other-pad', vendorId: 0x1234, productId: 0x5678 };

    const result = parseProfileFile(JSON.stringify(json), device);
    expect(result.deviceMismatch).toEqual({ expected: device.id, found: 'some-other-pad' });
  });

  it('rejects invalid JSON', () => {
    expect(() => parseProfileFile('{not json', device)).toThrow(InvalidConfigurationError);
  });

  it('rejects a file that is not a Kiyro profile', () => {
    expect(() => parseProfileFile(JSON.stringify({ hello: 'world' }), device)).toThrow(
      InvalidConfigurationError,
    );
  });

  it('rejects an unknown action type instead of importing it', () => {
    const profile = createProfile({ name: 'Bad', deviceId: device.id });
    const json = JSON.parse(serializeProfile(profile, device)) as {
      profile: { bindings: Record<string, unknown> };
    };
    json.profile.bindings['button-1'] = { type: 'exec', command: 'rm -rf /' };

    expect(() => parseProfileFile(JSON.stringify(json), device)).toThrow(InvalidConfigurationError);
  });
});

describe('profile factory', () => {
  it('ships encoder defaults that make the device useful immediately', () => {
    const profile = createDefaultProfile(device);
    expect(countAssigned(profile.bindings)).toBeGreaterThan(0);
    expect(profile.bindings['encoder-1-cw']).toEqual({ type: 'volume', command: 'up', step: 1 });
  });

  it('treats a cleared binding as equal to an absent one', () => {
    expect(bindingsEqual({ 'button-1': { type: 'none' } }, {})).toBe(true);
    expect(bindingsEqual({ 'button-1': { type: 'keyboard', key: 'KeyA' } }, {})).toBe(false);
  });
});
