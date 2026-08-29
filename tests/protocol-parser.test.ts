import { describe, expect, it } from 'vitest';
import { LineBuffer, parseDeviceMessage } from '@/lib/protocol/parser';
import { encodeEvent } from '@/lib/protocol/encoder';
import type { DeviceEvent } from '@/lib/protocol/types';

describe('parseDeviceMessage', () => {
  it('decodes handshake replies', () => {
    expect(parseDeviceMessage('READY')).toEqual({ type: 'ready' });
    expect(parseDeviceMessage('PONG')).toEqual({ type: 'pong' });
  });

  it('decodes button events', () => {
    expect(parseDeviceMessage('BTN:21')).toEqual({ type: 'button', code: 21 });
    expect(parseDeviceMessage('BTN:0')).toEqual({ type: 'button', code: 0 });
  });

  it('decodes both encoders', () => {
    expect(parseDeviceMessage('LEFT')).toEqual({ type: 'encoder', encoder: 1, direction: 'ccw' });
    expect(parseDeviceMessage('RIGHT')).toEqual({ type: 'encoder', encoder: 1, direction: 'cw' });
    expect(parseDeviceMessage('LEFT2')).toEqual({ type: 'encoder', encoder: 2, direction: 'ccw' });
    expect(parseDeviceMessage('RIGHT2')).toEqual({ type: 'encoder', encoder: 2, direction: 'cw' });
  });

  it('decodes encoder buttons and long presses', () => {
    expect(parseDeviceMessage('ENC_BTN:3')).toEqual({ type: 'encoderButton', code: 3 });
    expect(parseDeviceMessage('LONG:5')).toEqual({ type: 'longPress', code: 5 });
  });

  it('keeps unrecognised lines instead of throwing', () => {
    expect(parseDeviceMessage('BOOT OK')).toEqual({ type: 'unknown', raw: 'BOOT OK' });
    expect(parseDeviceMessage('BTN:abc')).toEqual({ type: 'unknown', raw: 'BTN:abc' });
    // Configuration commands are not part of this protocol; if a device ever
    // sent one of their replies it would be surfaced as unknown, not acted on.
    expect(parseDeviceMessage('SAVED')).toEqual({ type: 'unknown', raw: 'SAVED' });
    expect(parseDeviceMessage('CONFIG:{}')).toEqual({ type: 'unknown', raw: 'CONFIG:{}' });
  });

  it('round-trips through the encoder', () => {
    const events: DeviceEvent[] = [
      { type: 'button', code: 12 },
      { type: 'encoder', encoder: 2, direction: 'ccw' },
      { type: 'encoderButton', code: 4 },
      { type: 'longPress', code: 9 },
      { type: 'ready' },
      { type: 'pong' },
    ];

    for (const event of events) {
      expect(parseDeviceMessage(encodeEvent(event))).toEqual(event);
    }
  });
});

describe('LineBuffer', () => {
  it('reassembles messages split across reads', () => {
    const buffer = new LineBuffer();
    expect(buffer.push('BTN:2\r\nRIG')).toEqual(['BTN:2']);
    expect(buffer.push('HT\r\n')).toEqual(['RIGHT']);
  });

  it('handles several messages in one chunk and bare LF', () => {
    const buffer = new LineBuffer();
    expect(buffer.push('LEFT\nRIGHT\r\nBTN:7\n')).toEqual(['LEFT', 'RIGHT', 'BTN:7']);
  });

  it('drops empty lines and keeps partial tails pending', () => {
    const buffer = new LineBuffer();
    expect(buffer.push('\r\n\r\nBTN:1')).toEqual([]);
    expect(buffer.flush()).toEqual(['BTN:1']);
    expect(buffer.flush()).toEqual([]);
  });

  it('does not grow without bound when the device never sends a newline', () => {
    const buffer = new LineBuffer();
    expect(buffer.push('x'.repeat(LineBuffer.MAX_PENDING * 2))).toEqual([]);
    expect(buffer.flush()[0]?.length).toBe(LineBuffer.MAX_PENDING);
  });
});
