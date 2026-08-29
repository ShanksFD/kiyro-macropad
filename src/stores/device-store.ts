'use client';

import { create } from 'zustand';
import { deviceSession } from '@/lib/serial/device-session';
import type { ConnectionStatus, DeviceSessionState } from '@/lib/serial/device-session';
import { isWebSerialSupported } from '@/lib/serial/web-serial-transport';
import { KiyroDeviceError } from '@/lib/serial/errors';
import { DEFAULT_DEVICE, getDeviceById } from '@/lib/devices/registry';
import type { DeviceDefinition } from '@/lib/devices/types';
import type { DeviceStatusPayload } from '@/lib/electron/ipc-types';

interface DeviceStore extends DeviceSessionState {
  /** `null` until the client has checked — avoids an SSR/client mismatch. */
  webSerialSupported: boolean | null;
  connect: (options?: { simulated?: boolean }) => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  clearError: () => void;
}

let subscribed = false;

/**
 * Real hardware, in the Electron app: `window.kiyro`. Its main process owns
 * the actual serial port; this store only mirrors what it reports over IPC.
 * Simulated mode never touches this — it always goes through `deviceSession`
 * + `MockSerialTransport`, which is renderer-local and never conflicts with
 * main holding the real port.
 */
function isElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.kiyro);
}

function fromStatusPayload(payload: DeviceStatusPayload): DeviceSessionState {
  const device: DeviceDefinition | null =
    payload.status === 'connected' ? (getDeviceById(payload.deviceId ?? '') ?? DEFAULT_DEVICE) : null;

  return {
    status: payload.status,
    device,
    portInfo: payload.portInfo,
    transport: payload.status === 'connected' ? 'webserial' : null,
    error: payload.error,
    latencyMs: payload.latencyMs,
    connectedAt: payload.status === 'connected' ? Date.now() : null,
  };
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  ...deviceSession.state,
  webSerialSupported: null,

  connect: async (options) => {
    if (isElectron() && !options?.simulated) {
      await window.kiyro?.device.connect();
      return;
    }
    try {
      await deviceSession.connect(options ?? {});
    } catch (error) {
      // The session already stored user-facing copy; swallow so callers do not
      // have to guard every button click.
      if (!(error instanceof KiyroDeviceError)) throw error;
    }
  },
  disconnect: async () => {
    if (isElectron()) {
      await window.kiyro?.device.disconnect();
      return;
    }
    await deviceSession.disconnect();
  },
  reconnect: async () => {
    if (isElectron()) {
      await window.kiyro?.device.disconnect();
      await window.kiyro?.device.connect();
      return;
    }
    await deviceSession.reconnect();
  },
  clearError: () => set({ error: null }),
}));

/** Subscribes the store to the session exactly once, on the client. */
export function initDeviceStore(): void {
  if (subscribed || typeof window === 'undefined') return;
  subscribed = true;

  const electron = isElectron();

  if (electron) {
    // Electron's own bridge is the real connection; Web Serial is never used
    // for it, so the Connect button should never be disabled on its account.
    useDeviceStore.setState({ webSerialSupported: true });
    window.kiyro?.device.onStatus((payload) => useDeviceStore.setState(fromStatusPayload(payload)));
  } else {
    useDeviceStore.setState({ webSerialSupported: isWebSerialSupported() });
  }

  // Simulated mode always goes through `deviceSession`. In Electron, real
  // hardware never does (the main process owns that port), so only mock
  // state is let through there; outside Electron, `deviceSession` is still
  // the only source of truth and everything passes through as before.
  deviceSession.onStateChange((state) => {
    if (!electron || state.transport === 'mock' || state.status === 'unsupported') {
      useDeviceStore.setState(state);
    }
  });
}

/** The device model to render. Falls back to the reference device when offline. */
export function useActiveDevice(): DeviceDefinition {
  return useDeviceStore((state) => state.device) ?? DEFAULT_DEVICE;
}

export function useIsConnected(): boolean {
  return useDeviceStore((state) => state.status === 'connected');
}

export const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  unsupported: 'Browser not supported',
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Connection problem',
};
