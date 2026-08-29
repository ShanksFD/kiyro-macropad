/**
 * Canonical key identifiers.
 *
 * Kiyro stores `KeyboardEvent.code` values (`KeyA`, `Digit1`, `ArrowUp`) rather
 * than `key` values: `code` is layout independent, which is what a macro pad
 * needs — the same profile behaves the same on QWERTY and AZERTY hosts.
 */

export type KeyGroup =
  'Letters' | 'Digits' | 'Function' | 'Navigation' | 'Editing' | 'Numpad' | 'Symbols';

export interface KeyDefinition {
  /** `KeyboardEvent.code` value. */
  id: string;
  /** What the key cap says. */
  label: string;
  group: KeyGroup;
}

const letters: KeyDefinition[] = Array.from({ length: 26 }, (_, index) => {
  const letter = String.fromCharCode(65 + index);
  return { id: `Key${letter}`, label: letter, group: 'Letters' as const };
});

const digits: KeyDefinition[] = Array.from({ length: 10 }, (_, index) => ({
  id: `Digit${index}`,
  label: String(index),
  group: 'Digits' as const,
}));

const functionKeys: KeyDefinition[] = Array.from({ length: 12 }, (_, index) => ({
  id: `F${index + 1}`,
  label: `F${index + 1}`,
  group: 'Function' as const,
}));

const navigation: KeyDefinition[] = [
  { id: 'ArrowUp', label: 'Arrow Up', group: 'Navigation' },
  { id: 'ArrowDown', label: 'Arrow Down', group: 'Navigation' },
  { id: 'ArrowLeft', label: 'Arrow Left', group: 'Navigation' },
  { id: 'ArrowRight', label: 'Arrow Right', group: 'Navigation' },
  { id: 'Home', label: 'Home', group: 'Navigation' },
  { id: 'End', label: 'End', group: 'Navigation' },
  { id: 'PageUp', label: 'Page Up', group: 'Navigation' },
  { id: 'PageDown', label: 'Page Down', group: 'Navigation' },
];

const editing: KeyDefinition[] = [
  { id: 'Enter', label: 'Enter', group: 'Editing' },
  { id: 'Space', label: 'Space', group: 'Editing' },
  { id: 'Tab', label: 'Tab', group: 'Editing' },
  { id: 'Backspace', label: 'Backspace', group: 'Editing' },
  { id: 'Delete', label: 'Delete', group: 'Editing' },
  { id: 'Escape', label: 'Escape', group: 'Editing' },
  { id: 'Insert', label: 'Insert', group: 'Editing' },
  { id: 'CapsLock', label: 'Caps Lock', group: 'Editing' },
  { id: 'PrintScreen', label: 'Print Screen', group: 'Editing' },
];

const symbols: KeyDefinition[] = [
  { id: 'Minus', label: '-', group: 'Symbols' },
  { id: 'Equal', label: '=', group: 'Symbols' },
  { id: 'BracketLeft', label: '[', group: 'Symbols' },
  { id: 'BracketRight', label: ']', group: 'Symbols' },
  { id: 'Backslash', label: '\\', group: 'Symbols' },
  { id: 'Semicolon', label: ';', group: 'Symbols' },
  { id: 'Quote', label: "'", group: 'Symbols' },
  { id: 'Comma', label: ',', group: 'Symbols' },
  { id: 'Period', label: '.', group: 'Symbols' },
  { id: 'Slash', label: '/', group: 'Symbols' },
  { id: 'Backquote', label: '`', group: 'Symbols' },
];

const numpad: KeyDefinition[] = [
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `Numpad${index}`,
    label: `Num ${index}`,
    group: 'Numpad' as const,
  })),
  { id: 'NumpadAdd', label: 'Num +', group: 'Numpad' },
  { id: 'NumpadSubtract', label: 'Num -', group: 'Numpad' },
  { id: 'NumpadMultiply', label: 'Num *', group: 'Numpad' },
  { id: 'NumpadDivide', label: 'Num /', group: 'Numpad' },
  { id: 'NumpadEnter', label: 'Num Enter', group: 'Numpad' },
  { id: 'NumpadDecimal', label: 'Num .', group: 'Numpad' },
];

export const KEY_CATALOG: readonly KeyDefinition[] = [
  ...letters,
  ...digits,
  ...functionKeys,
  ...navigation,
  ...editing,
  ...symbols,
  ...numpad,
];

const KEY_BY_ID = new Map(KEY_CATALOG.map((key) => [key.id, key]));

export function findKey(id: string): KeyDefinition | undefined {
  return KEY_BY_ID.get(id);
}

export function isKnownKey(id: string): boolean {
  return KEY_BY_ID.has(id);
}

/** Falls back to the raw code so an unknown key still renders something sensible. */
export function keyLabel(id: string): string {
  return KEY_BY_ID.get(id)?.label ?? id;
}

export const MODIFIERS = ['Control', 'Shift', 'Alt', 'Meta'] as const;
export type Modifier = (typeof MODIFIERS)[number];

/** Modifier order is normalised so `Ctrl+Shift+S` never renders as `Shift+Ctrl+S`. */
const MODIFIER_ORDER: Record<Modifier, number> = { Control: 0, Shift: 1, Alt: 2, Meta: 3 };

export function sortModifiers(modifiers: readonly Modifier[]): Modifier[] {
  return [...new Set(modifiers)].sort((a, b) => MODIFIER_ORDER[a] - MODIFIER_ORDER[b]);
}

export function modifierLabel(modifier: Modifier, platform: 'windows' | 'mac' = 'windows'): string {
  if (platform === 'mac') {
    return { Control: 'Control', Shift: 'Shift', Alt: 'Option', Meta: 'Command' }[modifier];
  }
  return { Control: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Meta: 'Win' }[modifier];
}

/** Maps a browser keydown onto a canonical modifier list. */
export function modifiersFromEvent(event: {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): Modifier[] {
  const modifiers: Modifier[] = [];
  if (event.ctrlKey) modifiers.push('Control');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.altKey) modifiers.push('Alt');
  if (event.metaKey) modifiers.push('Meta');
  return modifiers;
}

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.has(code);
}
