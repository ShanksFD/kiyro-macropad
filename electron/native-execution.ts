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
import { CODE_TO_VK, MODIFIER_TO_VK, VK } from './win-vk';
import {
  lockWorkstation,
  openTaskManager,
  restartComputer,
  shutDownComputer,
  signOut,
  suspendToSleep,
  turnOffDisplays,
} from './win-system';

const MEDIA_COMMAND_TO_VK: Record<string, number> = {
  playPause: VK.MEDIA_PLAY_PAUSE,
  next: VK.MEDIA_NEXT_TRACK,
  previous: VK.MEDIA_PREV_TRACK,
  stop: VK.MEDIA_STOP,
};

const VOLUME_COMMAND_TO_VK: Record<string, number> = {
  up: VK.VOLUME_UP,
  down: VK.VOLUME_DOWN,
  mute: VK.VOLUME_MUTE,
};

/**
 * Upper bound on `step` taps, matching `actionSchema`'s own max
 * (`@/lib/actions/schema.ts`). A profile edited by hand could carry a larger
 * number; clamping here means the worst case is a wrong-but-brief volume
 * change rather than a thousand synthetic key presses.
 */
const MAX_VOLUME_STEP = 20;

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

/** Taps the same key `count` times in a row — how `step` on a volume action is honoured. */
async function tapRepeatedly(vk: number, count: number): Promise<void> {
  for (let n = 0; n < count; n += 1) {
    // Sequential by design: these must land as distinct key presses, not a
    // burst Windows is free to coalesce into one volume change.
    await tap(vk);
  }
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

        // `step` used to be stored, shown in the editor, and then ignored
        // here — every volume action tapped the key exactly once regardless,
        // which is why the volume always moved by Windows' fixed 2% no matter
        // what the slider said. Mute has no magnitude, so it stays one tap.
        if (action.command === 'mute') {
          void tap(vk);
        } else {
          const step = Math.min(Math.max(Math.trunc(action.step ?? 1), 1), MAX_VOLUME_STEP);
          void tapRepeatedly(vk, step);
        }
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
            // Not a synthesized Win+L, which is what this used to do and why
            // it never worked: Windows ignores an injected Win+L on purpose.
            // See `win-system.ts`.
            lockWorkstation();
            return { status: 'executed', by: this.id };

          case 'sleep':
            // Likewise not a `VK_SLEEP` tap — most machines have no such key
            // and nothing listens for it. See `win-system.ts`.
            suspendToSleep();
            return { status: 'executed', by: this.id };

          case 'displayOff':
            turnOffDisplays();
            return { status: 'executed', by: this.id };

          case 'screenshot':
            // Win+Shift+S: Snipping Tool's region overlay, so the user picks
            // what to capture. On a multi-monitor setup the full-screen grab
            // this used to do produced one huge image spanning every display,
            // which is almost never what was wanted.
            void combo([VK.LWIN, VK.SHIFT], VK.S);
            return { status: 'executed', by: this.id };

          case 'screenshotFull':
            // Win+PrintScreen, not plain PrintScreen — saves a file to
            // Pictures\Screenshots automatically instead of only copying to
            // the clipboard with nothing visible having happened.
            void combo([VK.LWIN], VK.SNAPSHOT);
            return { status: 'executed', by: this.id };

          case 'taskManager':
            // Launched directly rather than as Ctrl+Shift+Esc: the shell
            // hotkey is claimed above the normal input queue, so an injected
            // one is unreliable.
            openTaskManager();
            return { status: 'executed', by: this.id };

          case 'fileExplorer':
            void combo([VK.LWIN], VK.E);
            return { status: 'executed', by: this.id };

          case 'settings':
            void combo([VK.LWIN], VK.I);
            return { status: 'executed', by: this.id };

          case 'showDesktop':
            void combo([VK.LWIN], VK.D);
            return { status: 'executed', by: this.id };

          case 'signOut':
            signOut();
            return { status: 'executed', by: this.id };

          case 'restart':
            restartComputer();
            return { status: 'executed', by: this.id };

          case 'shutDown':
            shutDownComputer();
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

      case 'profile':
        // Handled a layer up, in `execution-pipeline.ts`: switching profiles
        // changes Kiyro's own state and needs the profile list, neither of
        // which this stateless OS-level executor has. Reaching here means the
        // pipeline's own dispatch missed it.
        return unavailable('profile actions are handled by the execution pipeline', controlId);

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
