import { z } from 'zod';
import { bindingMapSchema } from '../actions/schema';
import { PROFILE_SCHEMA_VERSION } from './types';
import type { MacroProfile, ProfileExport } from './types';

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected an ISO-8601 timestamp',
});

export const macroProfileSchema: z.ZodType<MacroProfile> = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  description: z.string().max(280).optional(),
  deviceId: z.string().min(1).max(64),
  schemaVersion: z.number().int().min(1).max(PROFILE_SCHEMA_VERSION),
  bindings: bindingMapSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const profileExportSchema: z.ZodType<ProfileExport> = z.object({
  format: z.literal('kiyro.profile'),
  schemaVersion: z.number().int().min(1).max(PROFILE_SCHEMA_VERSION),
  exportedAt: isoDate,
  device: z.object({
    id: z.string().min(1).max(64),
    vendorId: z.number().int().min(0).max(0xffff),
    productId: z.number().int().min(0).max(0xffff),
  }),
  profile: macroProfileSchema,
});

export const profileCollectionSchema = z.array(macroProfileSchema);

/**
 * Upgrades an older persisted profile in place.
 *
 * There is only one schema version today; the hook exists so v1 files keep
 * working when v2 lands instead of being silently discarded.
 */
export function migrateProfile(profile: MacroProfile): MacroProfile {
  if (profile.schemaVersion === PROFILE_SCHEMA_VERSION) return profile;
  return { ...profile, schemaVersion: PROFILE_SCHEMA_VERSION };
}

/** Flattens a Zod error into short lines suitable for an alert. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 6).map((issue) => {
    const path = issue.path.join('.') || 'root';
    return `${path}: ${issue.message}`;
  });
}
