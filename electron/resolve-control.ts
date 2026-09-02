/**
 * Holds the profile Kiyro last pushed and resolves a firmware event against
 * it. Pure and synchronous — no I/O — so `execution-pipeline.ts` can call it
 * inline in the serial `data` handler with no extra delay.
 */

import type { Action, BindingMap } from '../src/lib/actions/types';
import { DEFAULT_DEVICE, resolveEvent } from '../src/lib/devices/registry';
import type { EventResolution } from '../src/lib/devices/types';
import type { DeviceEvent } from '../src/lib/protocol/types';

/**
 * Kiyro (the renderer) is the source of truth; this holds nothing that was
 * not just handed to it over IPC, and nothing here is ever persisted —
 * profile persistence is `electron/profile-storage.ts`'s job.
 */
export class ActiveProfileStore {
  #profileId: string | null = null;
  #updatedAt: string | null = null;
  #bindings: BindingMap = {};

  setActiveProfile(payload: { profileId: string; updatedAt: string; bindings: BindingMap }): void {
    this.#profileId = payload.profileId;
    this.#updatedAt = payload.updatedAt;
    this.#bindings = payload.bindings;
    console.log(
      `[kiyro][diag] ActiveProfileStore.setActiveProfile: profileId=${this.#profileId} bindingKeys=[${Object.keys(this.#bindings).join(', ')}]`,
    );
  }

  get profileId(): string | null {
    return this.#profileId;
  }

  get updatedAt(): string | null {
    return this.#updatedAt;
  }

  getBinding(controlId: string): Action | undefined {
    return this.#bindings[controlId];
  }
}

/** Resolves a firmware event to a control id using the fixed GPIO map. */
export function resolveControlEvent(event: DeviceEvent): EventResolution {
  return resolveEvent(DEFAULT_DEVICE, event);
}
