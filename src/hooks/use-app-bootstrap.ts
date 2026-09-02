'use client';

import { useEffect } from 'react';
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
import type { MacroProfile } from '@/lib/profiles/types';

let wired = false;

function isElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.kiyro);
}

/**
 * Sends the given profile's bindings to Electron's main process so its
 * in-memory `ActiveProfileStore` (`electron/resolve-control.ts`) has
 * something to look up when a physical button is pressed — deduped by
 * `id:updatedAt` so an unchanged profile is never re-sent.
 *
 * Module-level, not a `useRef`: this is called both imperatively (once,
 * right after hydration — see the mount effect below) and reactively (on
 * every later profile change), and both call sites need to share one dedup
 * marker regardless of render timing.
 */
let lastPushedSignature: string | null = null;

function pushActiveProfileToElectron(profile: MacroProfile | null): void {
  const electronPresent = isElectron();
  if (!electronPresent || !profile) {
    console.log(
      `[kiyro][diag] pushActiveProfileToElectron: skipped (window.kiyro present=${electronPresent}, profile=${profile ? profile.id : 'null'})`,
    );
    return;
  }

  const signature = `${profile.id}:${profile.updatedAt}`;
  if (lastPushedSignature === signature) {
    console.log(`[kiyro][diag] pushActiveProfileToElectron: already pushed this exact signature (${signature}), skipping`);
    return;
  }

  console.log(
    `[kiyro][diag] pushActiveProfileToElectron: calling setActiveBindings for profileId=${profile.id} bindingKeys=[${Object.keys(profile.bindings).join(', ')}]`,
  );

  window.kiyro
    ?.setActiveBindings({ profileId: profile.id, updatedAt: profile.updatedAt, bindings: profile.bindings })
    .then(() => {
      lastPushedSignature = signature;
      console.log(`[kiyro][diag] pushActiveProfileToElectron: setActiveBindings resolved OK for ${profile.id}`);
    })
    .catch((error: unknown) => {
      // Left un-pushed: the next call (next profile change, or the next
      // mount) retries, since the signature never got recorded as sent.
      console.error('[kiyro][diag] pushActiveProfileToElectron: setActiveBindings rejected', error);
      useUiStore.getState().notify('Could not send the profile to Kiyro’s execution engine.', 'error');
    });
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
    console.log(`[kiyro][diag] mount effect running (wired=${wired}, window.kiyro present=${isElectron()})`);
    if (wired) return;
    wired = true;

    initDeviceStore();
    useUiStore.getState().hydrate();
    useQuickActionsStore.getState().hydrate();

    // Imperative, not just the reactive effect further down: that effect
    // depends on `useActiveProfile()`, which is derived state — relying on
    // it alone assumes React is guaranteed to re-run it once hydration
    // resolves. Pushing right here, the moment hydration itself finishes, is
    // what actually restores execution after a restart without the user
    // touching the Configure page again.
    void useProfileStore
      .getState()
      .hydrate(DEFAULT_DEVICE)
      .then(() => {
        const { profiles, activeProfileId } = useProfileStore.getState();
        const restored = profiles.find((profile) => profile.id === activeProfileId) ?? null;
        console.log(
          `[kiyro][diag] post-hydrate restored profile: ${restored ? `id=${restored.id} bindingKeys=[${Object.keys(restored.bindings).join(', ')}]` : 'null'}`,
        );
        pushActiveProfileToElectron(restored);
      });

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
  // changes while the app is already running (saved, switched, imported).
  // Restart-time restoration is handled separately, imperatively, right
  // after hydration in the mount effect above — this effect alone would
  // eventually catch that too, but only on trust that React re-runs it
  // exactly once activeProfile settles; the imperative call doesn't depend
  // on that. Both share `lastPushedSignature`, so neither double-sends.
  const activeProfile = useActiveProfile();

  useEffect(() => {
    pushActiveProfileToElectron(activeProfile);
  }, [activeProfile]);
}
