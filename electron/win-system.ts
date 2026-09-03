/**
 * Windows power/session actions, via `koffi` — the same FFI approach
 * `win-sendinput.ts` already uses (prebuilt binaries, no native compile step).
 *
 * These exist because the obvious "just synthesize the keystroke" approach
 * does not work for any of them, which is exactly how `system` actions
 * shipped broken:
 *
 * - **Lock** was `SendInput`-ing Win+L. Windows deliberately ignores an
 *   *injected* Win+L — the lock shortcut is handled by winlogon above the
 *   normal input queue precisely so software cannot fake it. `LockWorkStation`
 *   is the supported API and the only thing that actually works.
 * - **Sleep** was tapping `VK_SLEEP` (the hardware Sleep key). Most machines
 *   have no such key and nothing is listening for it, so it silently did
 *   nothing. `SetSuspendState` is the real entry point.
 *
 *   Note the argument: `bHibernate = 0` means *sleep*. The widely-copied
 *   `rundll32 powrprof.dll,SetSuspendState 0,1,0` incantation is the source
 *   of the "it hibernates instead of sleeping" folklore — rundll32 hands the
 *   whole `"0,1,0"` through as a *string pointer*, which is non-zero, so
 *   `bHibernate` reads as true. Calling the API directly, as here, does not
 *   have that problem.
 *
 * Shutdown/restart/sign-out go through `shutdown.exe` rather than
 * `ExitWindowsEx`: that API requires the calling process to first enable
 * `SE_SHUTDOWN_PRIVILEGE` in its own token (a three-call
 * `OpenProcessToken`/`LookupPrivilegeValue`/`AdjustTokenPrivileges` dance),
 * and fails with `ERROR_PRIVILEGE_NOT_HELD` if you skip it. `shutdown.exe`
 * does all of that itself.
 */

import { execFile } from 'node:child_process';
import koffi from 'koffi';

const user32 = koffi.load('user32.dll');
const powrprof = koffi.load('powrprof.dll');

const LockWorkStation = user32.func('bool LockWorkStation()');
/** `BOOLEAN` is a byte, not the 4-byte `BOOL` — declaring it as `bool` here would read the wrong width. */
const SetSuspendState = powrprof.func(
  'uint8 SetSuspendState(uint8 bHibernate, uint8 bForce, uint8 bWakeupEventsDisabled)',
);
const SendMessageW = user32.func(
  'intptr_t SendMessageW(void *hWnd, uint32 Msg, uintptr_t wParam, intptr_t lParam)',
);

const HWND_BROADCAST = 0xffff;
const WM_SYSCOMMAND = 0x0112;
const SC_MONITORPOWER = 0xf170;
/** `lParam` for `SC_MONITORPOWER`: 2 = off. (1 = low power, -1 = on.) */
const MONITOR_OFF = 2;

/** Locks the workstation — the real Win+L, not a synthesized one. */
export function lockWorkstation(): void {
  LockWorkStation();
}

/** Requests S3 sleep. Whether the machine honours it still depends on its power plan and drivers. */
export function suspendToSleep(): void {
  SetSuspendState(0, 0, 0);
}

/**
 * Turns the displays off (they come back on the next key press or mouse
 * move). Broadcast rather than sent to one window: this is a shell-level
 * request, not something a single window owns.
 */
export function turnOffDisplays(): void {
  SendMessageW(
    koffi.as(HWND_BROADCAST, 'void *'),
    WM_SYSCOMMAND,
    SC_MONITORPOWER,
    MONITOR_OFF,
  );
}

/**
 * Fire-and-forget process launch. Every caller here is a "make the OS do
 * something" action with no result worth waiting on, and the pipeline's
 * contract is synchronous (see `native-execution.ts`), so failures are
 * logged rather than surfaced.
 */
function run(command: string, args: string[]): void {
  execFile(command, args, (error) => {
    if (error) console.error(`[kiyro] '${command} ${args.join(' ')}' failed:`, error.message);
  });
}

export function signOut(): void {
  run('shutdown.exe', ['/l']);
}

export function restartComputer(): void {
  run('shutdown.exe', ['/r', '/t', '0']);
}

export function shutDownComputer(): void {
  run('shutdown.exe', ['/s', '/t', '0']);
}

export function openTaskManager(): void {
  run('taskmgr.exe', []);
}
