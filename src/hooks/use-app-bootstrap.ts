'use client';

import { useEffect, useRef } from 'react';
import { EncoderNormalizer } from '@/lib/devices/encoder-normalizer';
import { DEFAULT_DEVICE, resolveEvent } from '@/lib/devices/registry';
import { actionExecutor } from '@/lib/execution/executor';
import { encodeEvent } from '@/lib/protocol/encoder';
import { deviceSession } from '@/lib/serial/device-session';
import { initDeviceStore, useDeviceStore } from '@/stores/device-store';
import { useEditorStore } from '@/stores/editor-store';
import { useEventLogStore } from '@/stores/event-log-store';
import { useLiveInputStore } from '@/stores/live-input-store';
import { useActiveProfile, useProfileStore } from '@/stores/profile-store';
import { useQuickActionsStore } from '@/stores/quick-actions-store';
import { useUiStore } from '@/stores/ui-store';

let wired = false;

function isElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.kiyro);
}

/**
 * Boots the client-side singletons exactly once.
 *
 * Serial traffic is bridged into stores here rather than in components, so no
 * component subscribes to the raw event stream. Two independent input paths
 * feed the same stores:
 *
 * - `deviceSession.onEvent` (simulated mode only, in Electron — see
 *   `device-store.ts`): resolves the event and calls `actionExecutor`
 *   *itself*, since a simulated device has nothing else to execute it.
 * - `window.kiyro.device.onEvent`/`onExecutionOutcome` (real hardware, in
 *   Electron): Kiyro's main process already resolved and executed the
 *   binding — by the time these fire, the keystroke has already happened.
 *   This only mirrors that into the UI (live highlight, debug console,
 *   execution chip) and never re-executes anything.
 */
export function useAppBootstrap(): void {
  useEffect(() => {
    if (wired) return;
    wired = true;

    initDeviceStore();
    useUiStore.getState().hydrate();
    useQuickActionsStore.getState().hydrate();
    void useProfileStore.getState().hydrate(DEFAULT_DEVICE);

    const normalizer = new EncoderNormalizer();

    const unsubscribeEvents = deviceSession.onEvent((event) => {
      const device = useDeviceStore.getState().device ?? DEFAULT_DEVICE;
      const resolution = resolveEvent(device, event);

      if (event.type === 'encoder') {
        // Counted for diagnostics; every pulse still lights the dial so the UI
        // reflects exactly what the hardware sent.
        normalizer.push(event.encoder, event.direction);
      }

      const live = useLiveInputStore.getState();
      if (resolution.status === 'mapped') live.pulse([resolution.controlId]);
      else if (resolution.status === 'ambiguous') live.pulse(resolution.controlIds);

      // Input -> binding -> execution. Reached only for the simulated
      // transport: real hardware is executed by Electron's main process
      // directly (see the `window.kiyro.device.onExecutionOutcome`
      // subscription below), never here.
      if (resolution.status === 'mapped') {
        const action = useEditorStore.getState().draft[resolution.controlId];
        if (action) {
          const at = Date.now();
          live.dispatch({
            controlId: resolution.controlId,
            action,
            outcome: actionExecutor.execute({ controlId: resolution.controlId, action, at }),
            at,
          });
        }
      }

      if (event.type !== 'ready' && event.type !== 'pong') {
        live.record({ event, resolution, at: Date.now() });
      }
    });

    const unsubscribeFrames = deviceSession.onFrame((frame) => {
      useEventLogStore.getState().ingest(frame);
    });

    const unsubscribeSession = deviceSession.onStateChange((state) => {
      if (state.status !== 'connected') useLiveInputStore.getState().clear();
    });

    // Real-hardware mirror: Electron's main process already resolved and
    // executed the binding by the time these arrive. Purely for UI feedback —
    // never gates or repeats execution.
    let unsubscribeElectronEvents: (() => void) | undefined;
    let unsubscribeElectronOutcomes: (() => void) | undefined;
    let unsubscribeElectronStatus: (() => void) | undefined;

    if (isElectron()) {
      let frameId = 0;

      unsubscribeElectronEvents = window.kiyro?.device.onEvent(({ event, resolution, at }) => {
        const live = useLiveInputStore.getState();
        if (resolution.status === 'mapped') live.pulse([resolution.controlId]);
        else if (resolution.status === 'ambiguous') live.pulse(resolution.controlIds);
        if (event.type !== 'ready' && event.type !== 'pong') live.record({ event, resolution, at });

        frameId += 1;
        useEventLogStore.getState().ingest({ id: frameId, at, direction: 'rx', raw: encodeEvent(event), event });
      });

      unsubscribeElectronOutcomes = window.kiyro?.device.onExecutionOutcome(({ controlId, action, outcome, at }) => {
        useLiveInputStore.getState().dispatch({ controlId, action, outcome, at });
      });

      unsubscribeElectronStatus = window.kiyro?.device.onStatus((payload) => {
        if (payload.status !== 'connected') useLiveInputStore.getState().clear();
      });
    }

    return () => {
      unsubscribeEvents();
      unsubscribeFrames();
      unsubscribeSession();
      unsubscribeElectronEvents?.();
      unsubscribeElectronOutcomes?.();
      unsubscribeElectronStatus?.();
      wired = false;
    };
  }, []);

  // Load the active profile into the editor whenever the selection changes.
  const activeProfileId = useProfileStore((state) => state.activeProfileId);
  const profiles = useProfileStore((state) => state.profiles);
  const loadedProfileId = useEditorStore((state) => state.profileId);

  useEffect(() => {
    if (!activeProfileId || activeProfileId === loadedProfileId) return;
    const profile = profiles.find((candidate) => candidate.id === activeProfileId);
    if (profile) useEditorStore.getState().load(profile);
  }, [activeProfileId, loadedProfileId, profiles]);

  // Optional auto-reconnect: to a port the user already authorised (Web
  // Serial, non-Electron) or simply reopening the last-matched port
  // (Electron — no user-gesture requirement there).
  const autoReconnect = useUiStore((state) => state.preferences.autoReconnect);
  const preferencesHydrated = useUiStore((state) => state.hydrated);

  useEffect(() => {
    if (!preferencesHydrated || !autoReconnect) return;

    if (isElectron()) {
      if (useDeviceStore.getState().status !== 'disconnected') return;
      void window.kiyro?.device.connect().catch(() => undefined);
      return;
    }

    if (deviceSession.state.status !== 'disconnected') return;
    void deviceSession.connect({ reuseGrantedPort: true }).catch(() => undefined);
  }, [autoReconnect, preferencesHydrated]);

  // Push the active profile to Kiyro's own execution engine whenever it
  // becomes reachable or the profile itself changes (saved, switched,
  // imported). Kiyro stays the source of truth: the main process never has
  // anything it wasn't just handed.
  const activeProfile = useActiveProfile();
  const notify = useUiStore((state) => state.notify);
  const lastPushedSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isElectron() || !activeProfile) return;

    const signature = `${activeProfile.id}:${activeProfile.updatedAt}`;
    if (lastPushedSignatureRef.current === signature) return;

    let cancelled = false;
    window.kiyro
      ?.setActiveBindings({
        profileId: activeProfile.id,
        updatedAt: activeProfile.updatedAt,
        bindings: activeProfile.bindings,
      })
      .then(() => {
        if (!cancelled) lastPushedSignatureRef.current = signature;
      })
      .catch(() => {
        // Left un-pushed: the next change to the active profile retries,
        // since the signature never got recorded as sent.
        if (!cancelled) notify('Could not send the profile to Kiyro’s execution engine.', 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [activeProfile, notify]);
}
