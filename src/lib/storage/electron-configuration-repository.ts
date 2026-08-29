import type { MacroProfile } from '../profiles/types';
import type { ConfigurationRepository } from './configuration-repository';

/**
 * Profile persistence backed by Electron's main process (`window.kiyro.profiles.*`,
 * exposed by `electron/preload.ts`), which in turn writes JSON to
 * `app.getPath('userData')` (`electron/profile-storage.ts`) — surviving app
 * restarts, OS restarts, and device unplug/replug, unlike `localStorage`.
 *
 * Same shape as `LocalConfigurationRepository`, so `profile-store.ts` can pick
 * whichever is available without any other call site changing. Every method
 * below assumes `window.kiyro` exists — callers must check `isAvailable()`
 * (via `getProfileRepository()` in `profile-store.ts`) before using this.
 */
export class ElectronConfigurationRepository implements ConfigurationRepository {
  readonly target = 'local' as const;

  isAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.kiyro);
  }

  list(): Promise<MacroProfile[]> {
    return this.#bridge().profiles.list();
  }

  replaceAll(profiles: MacroProfile[]): Promise<void> {
    return this.#bridge().profiles.replaceAll(profiles);
  }

  save(profile: MacroProfile): Promise<void> {
    return this.#bridge().profiles.save(profile);
  }

  delete(id: string): Promise<void> {
    return this.#bridge().profiles.delete(id);
  }

  getActiveProfileId(): Promise<string | null> {
    return this.#bridge().profiles.getActiveId();
  }

  setActiveProfileId(id: string | null): Promise<void> {
    return this.#bridge().profiles.setActiveId(id);
  }

  #bridge() {
    if (!window.kiyro) throw new Error('ElectronConfigurationRepository used without window.kiyro present');
    return window.kiyro;
  }
}
