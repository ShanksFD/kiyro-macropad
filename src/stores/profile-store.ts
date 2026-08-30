'use client';

import { create } from 'zustand';
import type { BindingMap } from '@/lib/actions/types';
import type { DeviceDefinition } from '@/lib/devices/types';
import { createDefaultProfile, createProfile, duplicateProfile } from '@/lib/profiles/factory';
import type { MacroProfile } from '@/lib/profiles/types';
import { ElectronConfigurationRepository } from '@/lib/storage/electron-configuration-repository';
import { localProfiles as browserProfiles } from '@/lib/storage/configuration-repository';

/**
 * Profiles live wherever this environment can actually persist them: the
 * Electron bridge's `userData` JSON when it's present (real app usage), or
 * `localStorage` otherwise (Vitest/jsdom, which has no `window.kiyro`).
 * Callers never need to know which — both implement `ConfigurationRepository`.
 */
const electronProfiles = new ElectronConfigurationRepository();
function getProfileRepository() {
  return electronProfiles.isAvailable() ? electronProfiles : browserProfiles;
}

/**
 * `getActiveProfileId`/`setActiveProfileId` are sync on the `localStorage`
 * repository and async on the Electron one — `await` unwraps either case
 * uniformly, so call sites never need to know which repository is active.
 */
async function readActiveId(): Promise<string | null> {
  return getProfileRepository().getActiveProfileId();
}

function writeActiveId(id: string | null): void {
  void getProfileRepository().setActiveProfileId(id);
}

interface ProfileStore {
  /** False until local storage has been read on the client. */
  hydrated: boolean;
  profiles: MacroProfile[];
  activeProfileId: string | null;

  hydrate: (device: DeviceDefinition) => Promise<void>;
  setActive: (id: string) => void;
  create: (name: string, deviceId: string) => MacroProfile;
  rename: (id: string, name: string) => void;
  updateDescription: (id: string, description: string) => void;
  duplicate: (id: string) => MacroProfile | null;
  remove: (id: string) => void;
  adopt: (profile: MacroProfile) => void;
  saveBindings: (id: string, bindings: BindingMap) => MacroProfile | null;
}

function persist(profiles: MacroProfile[]): void {
  void getProfileRepository().replaceAll(profiles);
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  hydrated: false,
  profiles: [],
  activeProfileId: null,

  hydrate: async (device) => {
    if (get().hydrated) {
      console.log('[kiyro][diag] hydrate() called again but already hydrated — skipped');
      return;
    }

    const usingElectron = getProfileRepository() === electronProfiles;
    console.log(`[kiyro][diag] hydrate() starting, repository=${usingElectron ? 'electron' : 'localStorage'}`);

    const stored = await getProfileRepository().list();
    // TEMP DIAGNOSTIC (1): profiles loaded, straight from the repository.
    console.log(
      `[kiyro][diag] profiles loaded: count=${stored.length} ids=[${stored.map((p) => p.id).join(', ')}]`,
    );

    const profiles = stored.length > 0 ? stored : [createDefaultProfile(device)];
    if (stored.length === 0) persist(profiles);

    const storedActive = await readActiveId();
    const activeProfileId =
      profiles.find((profile) => profile.id === storedActive)?.id ?? profiles[0]?.id ?? null;
    // TEMP DIAGNOSTIC (2): the resolved active profile id vs. what was on disk.
    console.log(`[kiyro][diag] resolved activeProfileId=${activeProfileId} (storedActive was ${storedActive})`);

    // `storedActive` can be missing or stale (first run, or it pointed at a
    // profile that no longer exists) — whenever the resolved id differs from
    // what's on disk, write it back so the fallback choice itself becomes
    // "the" active profile for next launch, not just for this session.
    if (activeProfileId !== storedActive) writeActiveId(activeProfileId);

    set({ hydrated: true, profiles, activeProfileId });
  },

  setActive: (id) => {
    if (!get().profiles.some((profile) => profile.id === id)) return;
    writeActiveId(id);
    set({ activeProfileId: id });
  },

  create: (name, deviceId) => {
    const profile = createProfile({ name, deviceId });
    const profiles = [...get().profiles, profile];
    persist(profiles);
    writeActiveId(profile.id);
    set({ profiles, activeProfileId: profile.id });
    return profile;
  },

  rename: (id, name) => {
    const profiles = get().profiles.map((profile) =>
      profile.id === id ? { ...profile, name, updatedAt: new Date().toISOString() } : profile,
    );
    persist(profiles);
    set({ profiles });
  },

  updateDescription: (id, description) => {
    const profiles = get().profiles.map((profile) =>
      profile.id === id
        ? { ...profile, description, updatedAt: new Date().toISOString() }
        : profile,
    );
    persist(profiles);
    set({ profiles });
  },

  duplicate: (id) => {
    const source = get().profiles.find((profile) => profile.id === id);
    if (!source) return null;

    const copy = duplicateProfile(source);
    const profiles = [...get().profiles, copy];
    persist(profiles);
    set({ profiles });
    return copy;
  },

  remove: (id) => {
    const profiles = get().profiles.filter((profile) => profile.id !== id);
    persist(profiles);

    const activeProfileId =
      get().activeProfileId === id ? (profiles[0]?.id ?? null) : get().activeProfileId;
    writeActiveId(activeProfileId);
    set({ profiles, activeProfileId });
  },

  adopt: (profile) => {
    const profiles = [...get().profiles, profile];
    persist(profiles);
    writeActiveId(profile.id);
    set({ profiles, activeProfileId: profile.id });
  },

  saveBindings: (id, bindings) => {
    let saved: MacroProfile | null = null;
    const profiles = get().profiles.map((profile) => {
      if (profile.id !== id) return profile;
      saved = { ...profile, bindings, updatedAt: new Date().toISOString() };
      return saved;
    });

    if (!saved) return null;
    persist(profiles);
    set({ profiles });
    return saved;
  },
}));

export function useActiveProfile(): MacroProfile | null {
  return useProfileStore(
    (state) => state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null,
  );
}
