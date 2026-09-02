import type { ButtonDescriptor, DeviceDefinition, EncoderDescriptor } from './types';

/**
 * Development hardware: ESP32-C3 based 12-key macro pad with two encoders.
 *
 * Event codes are the GPIO numbers the firmware scans, captured by pressing
 * each key in physical order. They must match `BUTTON_PINS` in
 * `firmware/kiyro-macropad/pins.h` — that table and this one describe the same
 * wiring from the two ends.
 *
 * The encoders report `LEFT`/`RIGHT`/`LEFT2`/`RIGHT2`, but their shaft switches
 * have no confirmed code, so those controls stay `unverified` rather than being
 * mapped to a guess.
 */

interface ButtonSeed {
  index: number;
  eventCode: number | null;
}

const BUTTON_SEEDS: ButtonSeed[] = [
  { index: 1, eventCode: 21 },
  { index: 2, eventCode: 20 },
  { index: 3, eventCode: 1 },
  { index: 4, eventCode: 0 },
  { index: 5, eventCode: 10 },
  { index: 6, eventCode: 9 },
  { index: 7, eventCode: 3 },
  { index: 8, eventCode: 2 },
  { index: 9, eventCode: 8 },
  { index: 10, eventCode: 7 },
  { index: 11, eventCode: 6 },
  // The factory sketch never scanned this pin, which is why key 12 used to look
  // like a duplicate of key 4. The Kiyro firmware scans it.
  { index: 12, eventCode: 5 },
];

const COLUMNS = 4;

const buttons: ButtonDescriptor[] = BUTTON_SEEDS.map((seed) => ({
  id: `button-${seed.index}`,
  kind: 'button',
  index: seed.index,
  row: Math.floor((seed.index - 1) / COLUMNS) + 1,
  column: ((seed.index - 1) % COLUMNS) + 1,
  shortLabel: String(seed.index),
  label: `Button ${seed.index}`,
  eventCode: seed.eventCode,
  confidence: 'verified',
}));

const UNVERIFIED_ENCODER_BUTTON_NOTE =
  'The firmware emits ENC_BTN / LONG events, but the code for this encoder has not been confirmed. Use Test mode to capture it.';

const encoder = (index: 1 | 2, label: string): EncoderDescriptor => ({
  id: `encoder-${index}`,
  index,
  label,
  clockwise: {
    id: `encoder-${index}-cw`,
    kind: 'encoder-rotation',
    shortLabel: 'CW',
    label: `${label} · Clockwise`,
    confidence: 'verified',
  },
  counterClockwise: {
    id: `encoder-${index}-ccw`,
    kind: 'encoder-rotation',
    shortLabel: 'CCW',
    label: `${label} · Counter-clockwise`,
    confidence: 'verified',
  },
  press: {
    id: `encoder-${index}-press`,
    kind: 'encoder-press',
    shortLabel: 'Press',
    label: `${label} · Press`,
    confidence: 'unverified',
    note: UNVERIFIED_ENCODER_BUTTON_NOTE,
    eventCode: null,
  },
  longPress: {
    id: `encoder-${index}-long`,
    kind: 'encoder-long-press',
    shortLabel: 'Hold',
    label: `${label} · Long press`,
    confidence: 'unverified',
    note: UNVERIFIED_ENCODER_BUTTON_NOTE,
    eventCode: null,
  },
});

export const ESP32C3_MACROPAD: DeviceDefinition = {
  id: 'esp32c3-macropad-v1',
  name: 'ESP32-C3 Macro Pad',
  manufacturer: 'Kiyro reference hardware',
  summary: '12 keys, two rotary encoders and underglow, over USB Serial/JTAG.',
  vendorId: 0x303a,
  productId: 0x1001,
  transport: 'webserial',
  // The factory firmware reports input and nothing else: the manufacturer's own
  // application maps those events and keeps its profiles in a local file. Kiyro
  // works the same way.
  executionMode: 'host',
  capabilities: {
    buttons: 12,
    encoders: 2,
    encoderButtons: 2,
    // The hardware has underglow, but no protocol exists to drive it from the host.
    rgb: false,
    inputProtocol: true,
    deviceConfigProtocol: false,
    persistenceMode: 'local',
  },
  layout: { rows: 3, columns: COLUMNS },
  buttons,
  encoders: [encoder(1, 'Knob 1'), encoder(2, 'Knob 2')],
  serialFilters: [{ usbVendorId: 0x303a, usbProductId: 0x1001 }],
};
