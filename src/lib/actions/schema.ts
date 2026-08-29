import { z } from 'zod';
import { MODIFIERS } from './keys';
import {
  MEDIA_COMMANDS,
  MOUSE_BUTTONS,
  SCROLL_DIRECTIONS,
  SYSTEM_COMMANDS,
  VOLUME_COMMANDS,
} from './types';
import type { Action, BindingMap } from './types';

/** `KeyboardEvent.code`-shaped identifier. Kept permissive but never free-form text. */
const keyCode = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9]+$/, 'Key identifiers may only contain letters and digits');

export const actionSchema: z.ZodType<Action> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('keyboard'), key: keyCode }),
  z.object({
    type: z.literal('hotkey'),
    modifiers: z.array(z.enum(MODIFIERS)).max(4),
    key: keyCode,
  }),
  z.object({ type: z.literal('text'), text: z.string().max(2048) }),
  z.object({ type: z.literal('media'), command: z.enum(MEDIA_COMMANDS) }),
  z.object({
    type: z.literal('volume'),
    command: z.enum(VOLUME_COMMANDS),
    step: z.number().int().min(1).max(20).optional(),
  }),
  z.object({
    type: z.literal('scroll'),
    direction: z.enum(SCROLL_DIRECTIONS),
    amount: z.number().int().min(1).max(20),
  }),
  z.object({ type: z.literal('mouse'), button: z.enum(MOUSE_BUTTONS) }),
  z.object({ type: z.literal('system'), command: z.enum(SYSTEM_COMMANDS) }),
  z.object({
    type: z.literal('application'),
    // Allowed to be empty: the form starts blank and is still a valid draft.
    label: z.string().max(64),
    // Stored verbatim and never executed by the web app — a companion host is
    // responsible for deciding whether a target may be launched.
    target: z.string().max(512),
  }),
]);

export const bindingMapSchema: z.ZodType<BindingMap> = z.record(
  z.string().regex(/^[a-z0-9-]+$/, 'Invalid control id'),
  actionSchema,
);
