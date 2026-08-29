import { describe, expect, it } from 'vitest';
import { ESP32C3_MACROPAD } from '@/lib/devices/esp32c3-macropad';
import { findControl, listControls, matchDevice, resolveEvent } from '@/lib/devices/registry';

describe('device definition', () => {
  it('describes twelve buttons and two encoders', () => {
    expect(ESP32C3_MACROPAD.buttons).toHaveLength(12);
    expect(ESP32C3_MACROPAD.encoders).toHaveLength(2);
    // 12 keys + 2 encoders x 4 gestures
    expect(listControls(ESP32C3_MACROPAD)).toHaveLength(20);
  });

  it('exposes semantic control ids, not firmware codes', () => {
    expect(findControl(ESP32C3_MACROPAD, 'button-1')?.label).toBe('Button 1');
    expect(findControl(ESP32C3_MACROPAD, 'encoder-2-ccw')?.label).toContain('Counter-clockwise');
  });

  it('matches a port by USB identifiers', () => {
    expect(matchDevice({ vendorId: 0x303a, productId: 0x1001 })?.id).toBe(ESP32C3_MACROPAD.id);
    expect(matchDevice({ vendorId: 0x1234 })).toBeUndefined();
    expect(matchDevice({})).toBeUndefined();
  });
});

describe('resolveEvent', () => {
  it('maps a unique button code to one control', () => {
    expect(resolveEvent(ESP32C3_MACROPAD, { type: 'button', code: 21 })).toEqual({
      status: 'mapped',
      controlId: 'button-1',
    });
  });

  it('gives every key its own firmware code', () => {
    const codes = ESP32C3_MACROPAD.buttons.map((button) => button.eventCode);

    expect(new Set(codes).size).toBe(codes.length);
    // BTN:0 belongs to key 4 alone; key 12 is GPIO 5, which the factory sketch
    // never scanned.
    expect(resolveEvent(ESP32C3_MACROPAD, { type: 'button', code: 0 })).toEqual({
      status: 'mapped',
      controlId: 'button-4',
    });
    expect(resolveEvent(ESP32C3_MACROPAD, { type: 'button', code: 5 })).toEqual({
      status: 'mapped',
      controlId: 'button-12',
    });
  });

  it('maps encoder rotation to the matching direction', () => {
    expect(
      resolveEvent(ESP32C3_MACROPAD, { type: 'encoder', encoder: 1, direction: 'cw' }),
    ).toEqual({ status: 'mapped', controlId: 'encoder-1-cw' });
    expect(
      resolveEvent(ESP32C3_MACROPAD, { type: 'encoder', encoder: 2, direction: 'ccw' }),
    ).toEqual({ status: 'mapped', controlId: 'encoder-2-ccw' });
  });

  it('leaves unverified encoder-button codes unmapped', () => {
    expect(resolveEvent(ESP32C3_MACROPAD, { type: 'encoderButton', code: 3 }).status).toBe(
      'unmapped',
    );
    expect(resolveEvent(ESP32C3_MACROPAD, { type: 'longPress', code: 5 }).status).toBe('unmapped');
  });

  it('leaves unknown button codes unmapped', () => {
    expect(resolveEvent(ESP32C3_MACROPAD, { type: 'button', code: 99 }).status).toBe('unmapped');
  });
});
