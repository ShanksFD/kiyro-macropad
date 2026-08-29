import { profileCollectionSchema } from '../profiles/schema';
import type { MacroProfile } from '../profiles/types';
import {
  readJson,
  readString,
  remove,
  StorageKey,
  writeJson,
  writeString,
} from './browser-storage';

/**
 * Persistence seam.
 *
 * The browser is the only implementation today, and for this hardware it is the
 * whole story: the device has no configuration protocol, so profiles live on the
 * host — the same arrangement the manufacturer's own application uses. The
 * interface stays because a future device that *can* store a configuration
 * should slot in behind it without the editor changing.
 */
export interface ConfigurationRepository {
  readonly target: 'local' | 'device';
  /** Whether this repository can be used with the currently connected hardware. */
  isAvailable(): boolean;
  list(): Promise<MacroProfile[]>;
  save(profile: MacroProfile): Promise<void>;
  delete(id: string): Promise<void>;
}

export class LocalConfigurationRepository implements ConfigurationRepository {
  readonly target = 'local' as const;

  isAvailable(): boolean {
    return typeof window !== 'undefined';
  }

  async list(): Promise<MacroProfile[]> {
    return readJson(StorageKey.Profiles, profileCollectionSchema) ?? [];
  }

  async replaceAll(profiles: MacroProfile[]): Promise<void> {
    writeJson(StorageKey.Profiles, profiles);
  }

  async save(profile: MacroProfile): Promise<void> {
    const profiles = await this.list();
    const index = profiles.findIndex((candidate) => candidate.id === profile.id);
    if (index >= 0) profiles[index] = profile;
    else profiles.push(profile);
    await this.replaceAll(profiles);
  }

  async delete(id: string): Promise<void> {
    const profiles = await this.list();
    await this.replaceAll(profiles.filter((profile) => profile.id !== id));
  }

  getActiveProfileId(): string | null {
    return readString(StorageKey.ActiveProfileId);
  }

  setActiveProfileId(id: string | null): void {
    if (id === null) remove(StorageKey.ActiveProfileId);
    else writeString(StorageKey.ActiveProfileId, id);
  }
}

export const localProfiles = new LocalConfigurationRepository();
