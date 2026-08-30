import { z } from 'zod';

/**
 * Framework-free so both `ui-store.ts` (renderer) and
 * `electron/preferences-storage.ts` (main process) validate against the
 * exact same shape.
 */
export const preferencesSchema = z.object({
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  /** Reopen the last authorised port automatically on load. */
  autoReconnect: z.boolean().default(false),
  confirmBeforeReset: z.boolean().default(true),
  /** Write editor changes to the active local profile as they happen. */
  autoSaveLocal: z.boolean().default(false),
  /** Reveals the developer section: simulator, raw events, protocol diagnostics. */
  advancedMode: z.boolean().default(false),
  showRawEvents: z.boolean().default(false),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});
