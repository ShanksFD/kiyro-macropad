/**
 * Real OS-level execution — the Electron main-process implementation of
 * `ActionExecutor` (`@/lib/execution/executor.ts`).
 *
 * VK tables and dispatch mirror `host/kiyro_host/execution.py::execute_action`
 * 1:1 (that file stays the proven reference; nothing here changes it).
 * `keyboard`/`hotkey`/`media`/`volume` are solid ports. `mouse`/`scroll`,
 * `text`, `application`, and `system` are new (the Python reference left
 * them unimplemented) but follow the same "explicit unavailable, never
 * silently no-op" discipline for anything not confidently implementable.
 */

import { shell } from 'electron';
import type {
  ActionExecutor,
  ExecutionAvailability,
  ExecutionOutcome,
  ExecutionRequest,
} from '../src/lib/execution/executor';
import type { Action } from '../src/lib/actions/types';
import { sendKeyEvent, sendMouseClick, sendMouseWheel, sendUnicodeChar } from './win-sendinput';

const VK_BACK = 0x08;
const VK_TAB = 0x09;
const VK_RETURN = 0x0d;
const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12; // Alt
const VK_ESCAPE = 0x1b;
const VK_SPACE = 0x20;
const VK_PRIOR = 0x21; // Page Up
const VK_NEXT = 0x22; // Page Down
const VK_END = 0x23;
const VK_HOME = 0x24;
const VK_LEFT = 0x25;
const VK_UP = 0x26;
const VK_RIGHT = 0x27;
const VK_DOWN = 0x28;
const VK_DELETE = 0x2e;
const VK_L = 0x4c;
const VK_LWIN = 0x5b;
/** The dedicated hardware Sleep key. Synthesizing it asks Windows to sleep the same way the physical key would — whether anything actually happens depends on the machine's own power-plan/OEM support, same as pressing the real key would. */
const VK_SLEEP = 0x5f;
/** Print Screen. Alone it copies to the clipboard; combined with the Windows key (below) Windows 10/11 auto-saves it to Pictures\Screenshots instead. */
const VK_SNAPSHOT = 0x2c;
const VK_VOLUME_MUTE = 0xad;
const VK_VOLUME_DOWN = 0xae;
const VK_VOLUME_UP = 0xaf;
const VK_MEDIA_NEXT_TRACK = 0xb0;
const VK_MEDIA_PREV_TRACK = 0xb1;
const VK_MEDIA_STOP = 0xb2;
const VK_MEDIA_PLAY_PAUSE = 0xb3;

/** `KeyboardEvent.code` (`@/lib/actions/keys.ts`'s catalogue) -> Windows virtual-key code. */
const CODE_TO_VK: Record<string, number> = {
  Enter: VK_RETURN,
  Space: VK_SPACE,
  Tab: VK_TAB,
  Backspace: VK_BACK,
  Delete: VK_DELETE,
  Escape: VK_ESCAPE,
  ArrowUp: VK_UP,
  ArrowDown: VK_DOWN,
  ArrowLeft: VK_LEFT,
  ArrowRight: VK_RIGHT,
  Home: VK_HOME,
  End: VK_END,
  // Selectable in `KeySelect` (`@/lib/actions/keys.ts`) but had no VK entry
  // here until now — the "Print Screen" preset (`presets.ts`) silently
  // failed as unavailable at execution time despite looking configured.
  PrintScreen: VK_SNAPSHOT,
  PageUp: VK_PRIOR,
  PageDown: VK_NEXT,
};
for (let n = 0; n < 26; n += 1) CODE_TO_VK[`Key${String.fromCharCode(65 + n)}`] = 0x41 + n;
for (let n = 0; n < 10; n += 1) CODE_TO_VK[`Digit${n}`] = 0x30 + n;
for (let n = 1; n <= 12; n += 1) CODE_TO_VK[`F${n}`] = 0x70 + (n - 1);

const MODIFIER_TO_VK: Record<string, number> = {
  Control: VK_CONTROL,
  Shift: VK_SHIFT,
  Alt: VK_MENU,
  Meta: VK_LWIN,
};

const MEDIA_COMMAND_TO_VK: Record<string, number> = {
  playPause: VK_MEDIA_PLAY_PAUSE,
  next: VK_MEDIA_NEXT_TRACK,
  previous: VK_MEDIA_PREV_TRACK,
  stop: VK_MEDIA_STOP,
};

const VOLUME_COMMAND_TO_VK: Record<string, number> = {
  up: VK_VOLUME_UP,
  down: VK_VOLUME_DOWN,
  mute: VK_VOLUME_MUTE,
};

const TAP_DELAY_MS = 10;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One key press: down, then up. */
async function tap(vk: number): Promise<void> {
  sendKeyEvent(vk, false);
  await sleep(TAP_DELAY_MS);
  sendKeyEvent(vk, true);
}

/** Hold every modifier, tap the key, release modifiers in reverse. */
async function combo(modifierVks: number[], keyVk: number): Promise<void> {
  for (const vk of modifierVks) sendKeyEvent(vk, false);
  await sleep(TAP_DELAY_MS);
  await tap(keyVk);
  for (const vk of [...modifierVks].reverse()) sendKeyEvent(vk, true);
}

/** Types a string one character at a time via `KEYEVENTF_UNICODE`, so it works regardless of keyboard layout. */
async function typeText(text: string): Promise<void> {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    sendUnicodeChar(code, false);
    await sleep(TAP_DELAY_MS);
    sendUnicodeChar(code, true);
  }
}

/**
 * `kind: 'path'` (an exact file, normally chosen via the native file picker
 * — see `main.ts`'s `AppsBrowseExecutable` handler) goes through
 * `shell.openPath`, which asks the OS to open it however it normally would
 * (an .exe just runs). `kind: 'uri'` (a URL or a registered custom
 * protocol like `discord://`/`vscode://`) goes through `shell.openExternal`
 * — `openPath` does not understand protocol schemes, and `openExternal`
 * does not understand bare file paths, so which one to call is not
 * optional. Their failure signals differ too — `openPath` resolves with an
 * error *string* and never rejects, `openExternal` rejects with an `Error` —
 * so both need handling, not just one. Either way this only ever logs; it
 * can't change the fire-and-forget contract every other case here already
 * has (see the doc comment on `execute`).
 */
async function launchApplication(action: Extract<Action, { type: 'application' }>): Promise<void> {
  const target = action.target.trim();
  if (target === '') return;
  const name = action.label || target;

  try {
    if (action.kind === 'uri') {
      // Resolves on success, *rejects* on failure — unlike `openPath` below.
      await shell.openExternal(target);
    } else {
      // Resolves with '' on success, or an error string on failure — never rejects.
      const error = await shell.openPath(target);
      if (error) throw new Error(error);
    }
  } catch (error) {
    console.error(`[kiyro] failed to launch '${name}' (${action.kind}):`, error);
  }
}

/**
 * The real executor: Electron's main process, not a browser tab. Reported
 * unavailable only for action types this pass does not implement.
 */
export class NativeActionExecutor implements ActionExecutor {
  readonly id = 'electron-native';

  availability(): ExecutionAvailability {
    return { available: true };
  }

  execute(request: ExecutionRequest): ExecutionOutcome {
    // `SendInput` calls below are synchronous Win32 calls; the down/up delay
    // is real but tiny (10ms), so this returns immediately for all practical
    // purposes and never depends on anything async elsewhere in the app.
    const { controlId, action } = request;

    switch (action.type) {
      case 'none':
        return { status: 'skipped', reason: 'no-binding' };

      case 'keyboard': {
        const vk = CODE_TO_VK[action.key];
        if (vk === undefined) {
          return unavailable(`keyboard key '${action.key}' is not in the key table`);
        }
        void tap(vk);
        return { status: 'executed', by: this.id };
      }

      case 'hotkey': {
        const vk = CODE_TO_VK[action.key];
        const modifierVks = action.modifiers.map((modifier) => MODIFIER_TO_VK[modifier]);
        if (vk === undefined || modifierVks.some((entry) => entry === undefined)) {
          return unavailable(`hotkey ${action.modifiers.join('+')}+${action.key} uses an unmapped key/modifier`);
        }
        void combo(modifierVks as number[], vk);
        return { status: 'executed', by: this.id };
      }

      case 'volume': {
        const vk = VOLUME_COMMAND_TO_VK[action.command];
        if (vk === undefined) return unavailable(`unknown volume command '${action.command}'`);
        void tap(vk);
        return { status: 'executed', by: this.id };
      }

      case 'media': {
        const vk = MEDIA_COMMAND_TO_VK[action.command];
        if (vk === undefined) return unavailable(`unknown media command '${action.command}'`);
        void tap(vk);
        return { status: 'executed', by: this.id };
      }

      case 'text':
        void typeText(action.text);
        return { status: 'executed', by: this.id };

      case 'mouse':
        sendMouseClick(action.button);
        return { status: 'executed', by: this.id };

      case 'scroll':
        sendMouseWheel(action.direction, action.amount);
        return { status: 'executed', by: this.id };

      case 'application':
        if (action.target.trim() === '') return unavailable('no application configured', controlId);
        void launchApplication(action);
        return { status: 'executed', by: this.id };

      case 'system': {
        switch (action.command) {
          case 'lock':
            // Win+L — the standard Windows lock shortcut, same mechanism as
            // any other hotkey binding, just hardcoded instead of user-chosen.
            void combo([VK_LWIN], VK_L);
            return { status: 'executed', by: this.id };
          case 'sleep':
            void tap(VK_SLEEP);
            return { status: 'executed', by: this.id };
          case 'screenshot':
            // Win+PrintScreen, not plain PrintScreen — saves a file to
            // Pictures\Screenshots automatically instead of only copying to
            // the clipboard with nothing visible having happened.
            void combo([VK_LWIN], VK_SNAPSHOT);
            return { status: 'executed', by: this.id };
          default:
            // Unreachable as long as `SYSTEM_COMMANDS` (types.ts) and this
            // switch agree — TS proves that by narrowing `action` to `never`
            // here, which is also why this can't reference `action.command`
            // for the message (that's the actual point of the narrowing: a
            // future new command added to one but not the other becomes a
            // compile error here instead of a silent runtime gap).
            return unavailable('unknown system command', controlId);
        }
      }

      default:
        return unavailable('unrecognised action type');
    }
  }
}

function unavailable(message: string, controlId?: string): ExecutionOutcome {
  return {
    status: 'unavailable',
    reason: 'action-not-supported',
    message: controlId ? `${controlId}: ${message}` : message,
  };
}

export const nativeActionExecutor = new NativeActionExecutor();
