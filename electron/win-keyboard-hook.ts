/**
 * Exclusive keyboard capture for the shortcut recorder, via a Win32
 * low-level keyboard hook (`WH_KEYBOARD_LL`) through `koffi`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The recorder used to listen for DOM `keydown` events. That can only ever
 * see what Windows chose to deliver to the focused window, so any combination
 * the OS or the shell claims first is unrecordable — pressing Ctrl+Shift+Esc
 * to record it just opened Task Manager, Alt+Tab switched windows, and the
 * Windows key opened Start. `preventDefault()` cannot help: by the time a DOM
 * event exists, the shell has already acted.
 *
 * A low-level hook sits *ahead* of that dispatch, so returning a non-zero
 * value from the callback consumes the keystroke outright — the shell never
 * sees it. That is the only mechanism on Windows that makes those
 * combinations recordable.
 *
 * WHAT IS DELIBERATELY NOT CAPTURED
 * ---------------------------------
 * Ctrl+Alt+Del is the Secure Attention Sequence, handled by winlogon below
 * every hook — it cannot be captured by any user-mode process, by design.
 * Win+L is likewise reserved. Those two stay working normally while
 * recording, which is a safety property, not a limitation to work around.
 *
 * SAFETY
 * ------
 * While the hook is installed, *every* keystroke on the machine is swallowed.
 * Three independent things end that state, so a stuck hook cannot leave the
 * keyboard dead:
 *
 * 1. Capturing a key, or Escape, stops it immediately (the normal path).
 * 2. `CAPTURE_TIMEOUT_MS` stops it even if the renderer never asks.
 * 3. Windows itself silently drops any low-level hook whose callback exceeds
 *    `LowLevelHooksTimeout` (300 ms by default), so even a hard hang in this
 *    process restores the keyboard rather than wedging it. That is also why
 *    the callback below does the absolute minimum and defers the IPC send to
 *    `setImmediate` — it must never be the slow thing.
 *
 * Non-Windows platforms get `isSupported() === false` and the caller falls
 * back to DOM capture (`use-shortcut-recorder.ts`).
 */

import koffi from 'koffi';
import { VK, VK_TO_CODE, VK_TO_MODIFIER } from './win-vk';
import type { ModifierName } from './win-vk';

export interface CapturedShortcut {
  modifiers: ModifierName[];
  key: string;
}

export interface CaptureHandlers {
  /** Live feedback while modifiers are still held and no main key has landed yet. */
  onModifiers: (modifiers: ModifierName[]) => void;
  /** A complete combination was pressed. Capture has already stopped. */
  onCapture: (shortcut: CapturedShortcut) => void;
  /** Escape, the timeout, or an explicit stop. */
  onCancel: (reason: 'escape' | 'timeout') => void;
}

const WH_KEYBOARD_LL = 13;
const HC_ACTION = 0;
const WM_KEYDOWN = 0x0100;
const WM_KEYUP = 0x0101;
const WM_SYSKEYDOWN = 0x0104;
const WM_SYSKEYUP = 0x0105;

/** Long enough to think, short enough that a forgotten recorder is not a dead keyboard. */
const CAPTURE_TIMEOUT_MS = 15_000;

const isWindows = process.platform === 'win32';

// koffi does not export its `IKoffiCType`/`IKoffiRegisteredCallback`
// interfaces, so they are recovered from the functions that produce them
// rather than restated (and inevitably drifting) here.
type KoffiType = ReturnType<typeof koffi.proto>;
type KoffiCallback = ReturnType<typeof koffi.register>;

interface Win32 {
  SetWindowsHookExW: (
    idHook: number,
    lpfn: KoffiCallback,
    hMod: unknown,
    dwThreadId: number,
  ) => unknown;
  UnhookWindowsHookEx: (hhk: unknown) => boolean;
  CallNextHookEx: (hhk: unknown, nCode: number, wParam: number, lParam: unknown) => number;
  GetModuleHandleW: (name: string | null) => unknown;
  hookProto: KoffiType;
}

/**
 * Loaded lazily and only on Windows: nothing here should be able to break
 * `npm test` (jsdom) or a future macOS build merely by being imported.
 * A failure to bind leaves `win32` null and capture reports itself
 * unsupported, rather than throwing into the IPC handler.
 */
let win32: Win32 | null = null;
let bindingFailed = false;

function bind(): Win32 | null {
  if (win32 || bindingFailed) return win32;
  if (!isWindows) {
    bindingFailed = true;
    return null;
  }

  try {
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');

    koffi.struct('KBDLLHOOKSTRUCT', {
      vkCode: 'uint32',
      scanCode: 'uint32',
      flags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr_t',
    });

    // `lParam` is declared `void *` rather than `KBDLLHOOKSTRUCT *` so the
    // same raw pointer can be handed straight back to `CallNextHookEx`; it is
    // read with `koffi.decode` below instead.
    const hookProto = koffi.proto(
      'intptr_t __stdcall KiyroLowLevelKeyboardProc(int nCode, uintptr_t wParam, void *lParam)',
    );

    win32 = {
      SetWindowsHookExW: user32.func(
        'void *SetWindowsHookExW(int idHook, KiyroLowLevelKeyboardProc *lpfn, void *hMod, uint32 dwThreadId)',
      ) as Win32['SetWindowsHookExW'],
      UnhookWindowsHookEx: user32.func('bool UnhookWindowsHookEx(void *hhk)') as Win32['UnhookWindowsHookEx'],
      CallNextHookEx: user32.func(
        'intptr_t CallNextHookEx(void *hhk, int nCode, uintptr_t wParam, void *lParam)',
      ) as Win32['CallNextHookEx'],
      GetModuleHandleW: kernel32.func('void *GetModuleHandleW(const char16_t *lpModuleName)') as Win32['GetModuleHandleW'],
      hookProto,
    };
    return win32;
  } catch (error) {
    console.error('[kiyro] low-level keyboard hook unavailable:', error);
    bindingFailed = true;
    return null;
  }
}

export function isSupported(): boolean {
  return bind() !== null;
}

let hookHandle: unknown = null;
let registeredCallback: KoffiCallback | null = null;
let timeoutTimer: NodeJS.Timeout | null = null;
let handlers: CaptureHandlers | null = null;
/** Modifiers currently held. A `Set` because left/right Ctrl collapse to one name. */
const held = new Set<ModifierName>();

/** True while the hook owns the keyboard. */
export function isCapturing(): boolean {
  return hookHandle !== null;
}

/**
 * Installs the hook. Returns false if it could not be installed, in which
 * case the caller must fall back to DOM capture rather than leaving the
 * recorder waiting for events that will never arrive.
 */
export function startCapture(next: CaptureHandlers): boolean {
  const api = bind();
  if (!api) return false;
  if (isCapturing()) stopCapture();

  handlers = next;
  held.clear();

  const proc = (nCode: number, wParam: number, lParam: unknown): number => {
    if (nCode !== HC_ACTION) return api.CallNextHookEx(null, nCode, wParam, lParam);

    try {
      const event = koffi.decode(lParam, 'KBDLLHOOKSTRUCT') as { vkCode: number };
      handleKey(wParam, event.vkCode);
    } catch (error) {
      console.error('[kiyro] keyboard hook callback failed:', error);
    }

    // Swallow everything for the duration. A partially-swallowed capture
    // (letting some keys through) is worse than none: the shell would act on
    // exactly the combinations the recorder exists to capture.
    return 1;
  };

  registeredCallback = koffi.register(proc, koffi.pointer(api.hookProto));

  // `hMod` may be NULL for a low-level hook, but passing this process's own
  // module handle is what the documentation actually specifies and costs
  // nothing.
  hookHandle = api.SetWindowsHookExW(WH_KEYBOARD_LL, registeredCallback, api.GetModuleHandleW(null), 0);

  if (!hookHandle) {
    console.error('[kiyro] SetWindowsHookExW returned NULL — falling back to DOM capture');
    koffi.unregister(registeredCallback);
    registeredCallback = null;
    handlers = null;
    return false;
  }

  timeoutTimer = setTimeout(() => {
    const cancel = handlers?.onCancel;
    stopCapture();
    cancel?.('timeout');
  }, CAPTURE_TIMEOUT_MS);

  console.log('[kiyro] shortcut capture: keyboard hook installed');
  return true;
}

/** Idempotent — safe to call from the timeout, the renderer, and window teardown alike. */
export function stopCapture(): void {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }

  if (hookHandle && win32) {
    win32.UnhookWindowsHookEx(hookHandle);
    console.log('[kiyro] shortcut capture: keyboard hook removed');
  }
  hookHandle = null;

  if (registeredCallback) {
    koffi.unregister(registeredCallback);
    registeredCallback = null;
  }

  handlers = null;
  held.clear();
}

/**
 * Translates one hooked key event into Kiyro's model.
 *
 * Deliberately runs *inside* the hook callback but only touches in-memory
 * state; anything that could block (IPC, logging a payload) is left to the
 * handlers, which defer it (see `ipc-handlers.ts`).
 */
function handleKey(message: number, vkCode: number): void {
  const current = handlers;
  if (!current) return;

  const isDown = message === WM_KEYDOWN || message === WM_SYSKEYDOWN;
  const isUp = message === WM_KEYUP || message === WM_SYSKEYUP;
  if (!isDown && !isUp) return;

  const modifier = VK_TO_MODIFIER[vkCode];

  if (modifier) {
    if (isDown) held.add(modifier);
    else held.delete(modifier);
    current.onModifiers([...held]);
    return;
  }

  if (isUp) return;

  // Escape cancels only when pressed bare — with a modifier held it is a
  // combo like any other (Ctrl+Shift+Esc, the Task Manager shortcut, being
  // the whole reason this hook exists). Checking `held.size` here, instead
  // of cancelling unconditionally, is what makes that recordable at all:
  // the old code cancelled on the vkCode alone, before ever looking at what
  // else was held, so that exact combination could never be captured.
  if (vkCode === VK.ESCAPE && held.size === 0) {
    stopCapture();
    current.onCancel('escape');
    return;
  }

  const key = VK_TO_CODE[vkCode];
  // An unmapped key (a laptop's Fn-layer media key, say) is ignored rather
  // than recorded: storing a `code` that `CODE_TO_VK` cannot send back would
  // save a binding that can never execute.
  if (!key) return;

  const modifiers = [...held];
  stopCapture();
  current.onCapture({ modifiers, key });
}
