import { InvalidConfigurationError } from '../serial/errors';
import type { DeviceDefinition } from '../devices/types';
import { formatIssues, migrateProfile, profileExportSchema } from './schema';
import { PROFILE_SCHEMA_VERSION } from './types';
import type { MacroProfile, ProfileExport } from './types';
import { createId } from './factory';

export function buildExport(profile: MacroProfile, device: DeviceDefinition): ProfileExport {
  return {
    format: 'kiyro.profile',
    schemaVersion: PROFILE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    device: { id: device.id, vendorId: device.vendorId, productId: device.productId },
    profile,
  };
}

export function serializeProfile(profile: MacroProfile, device: DeviceDefinition): string {
  return `${JSON.stringify(buildExport(profile, device), null, 2)}\n`;
}

export interface ImportResult {
  profile: MacroProfile;
  /** Set when the file was authored for a different device model. */
  deviceMismatch?: { expected: string; found: string };
}

/**
 * Parses an exported file.
 *
 * Imported JSON is untrusted: it is validated against the schema, given a fresh
 * id so it can never overwrite an existing profile, and never executed.
 */
export function parseProfileFile(contents: string, device: DeviceDefinition): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(contents);
  } catch {
    throw new InvalidConfigurationError('That file is not valid JSON.');
  }

  const parsed = profileExportSchema.safeParse(json);
  if (!parsed.success) {
    throw new InvalidConfigurationError(
      'That file is not a Kiyro profile, or it was written by a newer version.',
      formatIssues(parsed.error),
    );
  }

  const now = new Date().toISOString();
  const profile: MacroProfile = {
    ...migrateProfile(parsed.data.profile),
    id: createId(),
    updatedAt: now,
  };

  const result: ImportResult = { profile };
  if (parsed.data.device.id !== device.id) {
    result.deviceMismatch = { expected: device.id, found: parsed.data.device.id };
  }
  return result;
}

/** Triggers a browser download. Client-only. */
export function downloadProfile(profile: MacroProfile, device: DeviceDefinition): void {
  const blob = new Blob([serializeProfile(profile, device)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${profile.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.kiyro.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
