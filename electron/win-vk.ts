/**
 * The one Windows virtual-key table.
 *
 * Shared by everything that has to cross between Kiyro's canonical
 * `KeyboardEvent.code` identifiers (`@/lib/actions/keys.ts`) and Win32 VK
 * codes: `native-execution.ts` sends keys with it, `win-keyboard-hook.ts`
 * reads captured keys back through it. It lives in its own file so those two
 * cannot drift — a key present in one direction but not the other is exactly
 * the class of bug that made "Print Screen" look configured while silently
 * refusing to execute.
 *
 * This covers the *whole* of `KEY_CATALOG`, not just the common keys. Anything
 * selectable in `KeySelect` but missing here fails at execution time with
 * "not in the key table" — visible only in the log, long after the user
 * saved a binding that looked fine.
 */

export const VK = {
  BACK: 0x08,
  TAB: 0x09,
  RETURN: 0x0d,
  SHIFT: 0x10,
  CONTROL: 0x11,
  MENU: 0x12, // Alt
  CAPITAL: 0x14, // Caps Lock
  ESCAPE: 0x1b,
  SPACE: 0x20,
  PRIOR: 0x21, // Page Up
  NEXT: 0x22, // Page Down
  END: 0x23,
  HOME: 0x24,
  LEFT: 0x25,
  UP: 0x26,
  RIGHT: 0x27,
  DOWN: 0x28,
  SNAPSHOT: 0x2c, // Print Screen
  INSERT: 0x2d,
  DELETE: 0x2e,
  L: 0x4c,
  D: 0x44,
  E: 0x45,
  I: 0x49,
  S: 0x53,
  LWIN: 0x5b,
  RWIN: 0x5c,
  SLEEP: 0x5f,
  LSHIFT: 0xa0,
  RSHIFT: 0xa1,
  LCONTROL: 0xa2,
  RCONTROL: 0xa3,
  LMENU: 0xa4,
  RMENU: 0xa5,
  VOLUME_MUTE: 0xad,
  VOLUME_DOWN: 0xae,
  VOLUME_UP: 0xaf,
  MEDIA_NEXT_TRACK: 0xb0,
  MEDIA_PREV_TRACK: 0xb1,
  MEDIA_STOP: 0xb2,
  MEDIA_PLAY_PAUSE: 0xb3,
} as const;

/** `KeyboardEvent.code` -> Windows virtual-key code. */
export const CODE_TO_VK: Record<string, number> = {
  Enter: VK.RETURN,
  Space: VK.SPACE,
  Tab: VK.TAB,
  Backspace: VK.BACK,
  Delete: VK.DELETE,
  Insert: VK.INSERT,
  CapsLock: VK.CAPITAL,
  Escape: VK.ESCAPE,
  ArrowUp: VK.UP,
  ArrowDown: VK.DOWN,
  ArrowLeft: VK.LEFT,
  ArrowRight: VK.RIGHT,
  Home: VK.HOME,
  End: VK.END,
  PrintScreen: VK.SNAPSHOT,
  PageUp: VK.PRIOR,
  PageDown: VK.NEXT,

  // OEM keys. These are the VKs for a US layout; Kiyro stores layout-
  // independent `code` values, and Windows maps VK -> character per the
  // active layout at press time, so this is the correct pairing.
  Minus: 0xbd,
  Equal: 0xbb,
  BracketLeft: 0xdb,
  BracketRight: 0xdd,
  Backslash: 0xdc,
  Semicolon: 0xba,
  Quote: 0xde,
  Comma: 0xbc,
  Period: 0xbe,
  Slash: 0xbf,
  Backquote: 0xc0,

  NumpadMultiply: 0x6a,
  NumpadAdd: 0x6b,
  NumpadSubtract: 0x6d,
  NumpadDecimal: 0x6e,
  NumpadDivide: 0x6f,
  // Windows has no separate VK for the numpad's Enter — it is VK_RETURN with
  // the extended-key flag set, which nothing here needs to distinguish.
  NumpadEnter: VK.RETURN,
};

for (let n = 0; n < 26; n += 1) CODE_TO_VK[`Key${String.fromCharCode(65 + n)}`] = 0x41 + n;
for (let n = 0; n < 10; n += 1) CODE_TO_VK[`Digit${n}`] = 0x30 + n;
for (let n = 0; n < 10; n += 1) CODE_TO_VK[`Numpad${n}`] = 0x60 + n;
for (let n = 1; n <= 12; n += 1) CODE_TO_VK[`F${n}`] = 0x70 + (n - 1);

export type ModifierName = 'Control' | 'Shift' | 'Alt' | 'Meta';

/**
 * Typed by its index signature rather than `Record<ModifierName, …>` on
 * purpose: with `noUncheckedIndexedAccess`, that makes a lookup
 * `number | undefined`, so callers are forced to handle a modifier that isn't
 * in the table instead of silently sending VK 0.
 */
export const MODIFIER_TO_VK: Record<string, number> = {
  Control: VK.CONTROL,
  Shift: VK.SHIFT,
  Alt: VK.MENU,
  Meta: VK.LWIN,
};

/**
 * VK -> `code`, for reading captured input back (`win-keyboard-hook.ts`).
 *
 * Built by inverting `CODE_TO_VK` *without* overwriting: where two codes share
 * a VK (only `Enter`/`NumpadEnter` today), the first wins, and the table above
 * is ordered so that is the plain one.
 */
export const VK_TO_CODE: Record<number, string> = {};
for (const [code, vk] of Object.entries(CODE_TO_VK)) {
  if (VK_TO_CODE[vk] === undefined) VK_TO_CODE[vk] = code;
}

/**
 * VK -> modifier, covering the left/right-specific codes a low-level keyboard
 * hook reports (`VK_LCONTROL`/`VK_RCONTROL`, …) as well as the generic ones
 * that `GetKeyState`-style APIs use. Kiyro's model has no left/right
 * distinction, so both sides collapse onto the same name.
 */
export const VK_TO_MODIFIER: Record<number, ModifierName> = {
  [VK.CONTROL]: 'Control',
  [VK.LCONTROL]: 'Control',
  [VK.RCONTROL]: 'Control',
  [VK.SHIFT]: 'Shift',
  [VK.LSHIFT]: 'Shift',
  [VK.RSHIFT]: 'Shift',
  [VK.MENU]: 'Alt',
  [VK.LMENU]: 'Alt',
  [VK.RMENU]: 'Alt',
  [VK.LWIN]: 'Meta',
  [VK.RWIN]: 'Meta',
};
