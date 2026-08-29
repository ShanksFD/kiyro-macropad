import type { DeviceEvent } from '../protocol/types';
import { ESP32C3_MACROPAD } from './esp32c3-macropad';
import type { ControlDescriptor, ControlId, DeviceDefinition, EventResolution } from './types';

/** Every device model Kiyro knows how to talk to. */
export const DEVICE_REGISTRY: readonly DeviceDefinition[] = [ESP32C3_MACROPAD];

export const DEFAULT_DEVICE = ESP32C3_MACROPAD;

export function getDeviceById(id: string): DeviceDefinition | undefined {
  return DEVICE_REGISTRY.find((device) => device.id === id);
}

/** Matches a connected port against the registry using its USB identifiers. */
export function matchDevice(info: {
  vendorId?: number;
  productId?: number;
}): DeviceDefinition | undefined {
  if (info.vendorId === undefined) return undefined;
  return DEVICE_REGISTRY.find(
    (device) =>
      device.vendorId === info.vendorId &&
      (info.productId === undefined || device.productId === info.productId),
  );
}

/** Browser picker filters covering every known device. */
export function allSerialFilters(): SerialPortFilter[] {
  return DEVICE_REGISTRY.flatMap((device) => device.serialFilters);
}

/** Flattened list of every bindable control on a device, in editor order. */
export function listControls(device: DeviceDefinition): ControlDescriptor[] {
  return [
    ...device.buttons,
    ...device.encoders.flatMap((encoder) => [
      encoder.clockwise,
      encoder.counterClockwise,
      encoder.press,
      encoder.longPress,
    ]),
  ];
}

export function findControl(
  device: DeviceDefinition,
  controlId: ControlId,
): ControlDescriptor | undefined {
  return listControls(device).find((control) => control.id === controlId);
}

/**
 * Turns a firmware event into the control(s) it could belong to.
 *
 * Ambiguity is represented explicitly rather than guessed: the legacy firmware
 * reuses `BTN:0` for two keys, and the encoder-button codes are unknown.
 */
export function resolveEvent(device: DeviceDefinition, event: DeviceEvent): EventResolution {
  switch (event.type) {
    case 'button': {
      const matches = device.buttons.filter((button) => button.eventCode === event.code);
      if (matches.length === 1 && matches[0]) return { status: 'mapped', controlId: matches[0].id };
      if (matches.length > 1) {
        return { status: 'ambiguous', controlIds: matches.map((button) => button.id) };
      }
      return { status: 'unmapped', event };
    }

    case 'encoder': {
      const encoder = device.encoders.find((candidate) => candidate.index === event.encoder);
      if (!encoder) return { status: 'unmapped', event };
      return {
        status: 'mapped',
        controlId: event.direction === 'cw' ? encoder.clockwise.id : encoder.counterClockwise.id,
      };
    }

    case 'encoderButton': {
      const matches = device.encoders.filter((item) => item.press.eventCode === event.code);
      if (matches.length === 1 && matches[0]) {
        return { status: 'mapped', controlId: matches[0].press.id };
      }
      if (matches.length > 1) {
        return { status: 'ambiguous', controlIds: matches.map((item) => item.press.id) };
      }
      return { status: 'unmapped', event };
    }

    case 'longPress': {
      const matches = device.encoders.filter((item) => item.longPress.eventCode === event.code);
      if (matches.length === 1 && matches[0]) {
        return { status: 'mapped', controlId: matches[0].longPress.id };
      }
      if (matches.length > 1) {
        return { status: 'ambiguous', controlIds: matches.map((item) => item.longPress.id) };
      }
      return { status: 'unmapped', event };
    }

    default:
      return { status: 'unmapped', event };
  }
}

/** Human label for an event, used by the debug console and test mode. */
export function describeEvent(event: DeviceEvent): string {
  switch (event.type) {
    case 'ready':
      return 'Device ready';
    case 'pong':
      return 'Ping acknowledged';
    case 'button':
      return `Button event (code ${event.code})`;
    case 'encoder':
      return `Encoder ${event.encoder} ${event.direction === 'cw' ? 'clockwise' : 'counter-clockwise'}`;
    case 'encoderButton':
      return `Encoder button (code ${event.code})`;
    case 'longPress':
      return `Long press (code ${event.code})`;
    default:
      return 'Unrecognised message';
  }
}
