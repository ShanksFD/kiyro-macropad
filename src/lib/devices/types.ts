import type { DeviceEvent, EncoderIndex } from '../protocol/types';

/**
 * Stable, human-meaningful identifier for a bindable control
 * (`button-1`, `encoder-1-cw`, …).
 *
 * Raw GPIO / firmware codes never appear in the UI or in saved profiles — this
 * is the id everything else keys off, so a firmware remap does not invalidate
 * a user's profiles.
 */
export type ControlId = string;

export type ControlKind = 'button' | 'encoder-rotation' | 'encoder-press' | 'encoder-long-press';

/** How much we actually know about a control's firmware event mapping. */
export type MappingConfidence =
  /** Observed on hardware and unambiguous. */
  | 'verified'
  /** Observed, but the firmware emits the same code for more than one control. */
  | 'ambiguous'
  /** The firmware is expected to emit something, but it has not been confirmed. */
  | 'unverified';

export interface ControlDescriptor {
  id: ControlId;
  kind: ControlKind;
  /** Short label used on the device visual, e.g. `1` or `CW`. */
  shortLabel: string;
  /** Full label used in the inspector, e.g. `Button 1` or `Encoder 1 · Clockwise`. */
  label: string;
  confidence: MappingConfidence;
  /** Rendered next to the control when its mapping is not `verified`. */
  note?: string;
}

export interface ButtonDescriptor extends ControlDescriptor {
  kind: 'button';
  /** 1-based physical index as printed on the device layout. */
  index: number;
  row: number;
  column: number;
  /** Firmware event code, or `null` when the mapping is unknown. */
  eventCode: number | null;
}

export interface EncoderDescriptor {
  id: string;
  index: EncoderIndex;
  label: string;
  clockwise: ControlDescriptor;
  counterClockwise: ControlDescriptor;
  press: ControlDescriptor & { eventCode: number | null };
  longPress: ControlDescriptor & { eventCode: number | null };
}

export interface DeviceCapabilities {
  buttons: number;
  encoders: number;
  encoderButtons: number;
  /** Host-controlled RGB. The pad may still have underglow of its own. */
  rgb: boolean;
  /** The device reports input events over serial. */
  inputProtocol: boolean;
  /**
   * The device can be asked for and given a configuration over serial.
   *
   * False is not a limitation to work around: it means configuration belongs to
   * the host, which is how this hardware — and the manufacturer's own app — has
   * always worked.
   */
  deviceConfigProtocol: boolean;
  /** Where a configuration lives once saved. */
  persistenceMode: PersistenceMode;
}

/**
 * Who carries out a binding when a control is pressed.
 *
 * `host` means the computer performs the action; the device only reports that
 * the control was used. `device` would mean the pad performs it itself (USB HID
 * firmware), which this hardware does not do.
 */
export type ExecutionMode = 'host' | 'device';

/** Where configuration is stored. */
export type PersistenceMode = 'local' | 'device';

export interface DeviceDefinition {
  id: string;
  name: string;
  manufacturer: string;
  /** Short description shown on the Devices page. */
  summary: string;
  vendorId: number;
  productId: number;
  transport: 'webserial';
  executionMode: ExecutionMode;
  capabilities: DeviceCapabilities;
  layout: { rows: number; columns: number };
  buttons: ButtonDescriptor[];
  encoders: EncoderDescriptor[];
  serialFilters: SerialPortFilter[];
}

/** Result of turning a firmware event into control ids. */
export type EventResolution =
  | { status: 'mapped'; controlId: ControlId }
  /** The firmware code maps to more than one physical control. */
  | { status: 'ambiguous'; controlIds: ControlId[] }
  | { status: 'unmapped'; event: DeviceEvent };
