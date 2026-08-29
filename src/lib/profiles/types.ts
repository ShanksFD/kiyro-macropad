import type { BindingMap } from '../actions/types';

/**
 * Bumped whenever the persisted shape changes.
 * Older files are upgraded by `migrateProfile` rather than rejected.
 */
export const PROFILE_SCHEMA_VERSION = 1;

export interface MacroProfile {
  id: string;
  name: string;
  description?: string;
  /** Device definition this profile was authored for. */
  deviceId: string;
  schemaVersion: number;
  bindings: BindingMap;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Envelope written by "Export profile" and accepted by "Import profile". */
export interface ProfileExport {
  format: 'kiyro.profile';
  schemaVersion: number;
  exportedAt: string;
  device: {
    id: string;
    vendorId: number;
    productId: number;
  };
  profile: MacroProfile;
}

/** Where a configuration currently lives. */
export type PersistenceTarget = 'local' | 'device';
