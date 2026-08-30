import type { Preferences } from '../preferences/schema';

/**
 * Preferences persistence backed by Electron's main process
 * (`window.kiyro.preferences.*`), which writes JSON to
 * `app.getPath('userData')` (`electron/preferences-storage.ts`) — same
 * reasoning as `ElectronConfigurationRepository`: `localStorage` alone isn't
 * reliably surviving app restarts in this setup, so preferences get the same
 * treatment profiles already have.
 */
export class ElectronPreferencesRepository {
  isAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.kiyro);
  }

  get(): Promise<Preferences | null> {
    return this.#bridge().preferences.get();
  }

  set(preferences: Preferences): Promise<void> {
    return this.#bridge().preferences.set(preferences);
  }

  #bridge() {
    if (!window.kiyro) throw new Error('ElectronPreferencesRepository used without window.kiyro present');
    return window.kiyro;
  }
}
