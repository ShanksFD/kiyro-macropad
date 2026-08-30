/**
 * Windows `SendInput`, via `koffi` (FFI with prebuilt binaries — no native
 * module compile step, unlike `ffi-napi`/`robotjs`-style addons).
 *
 * This is a direct TypeScript port of the already-debugged
 * `host/kiyro_host/execution.py`. That file's own comment explains the one
 * subtlety that cost real debugging time, reproduced here because it is easy
 * to reintroduce by "simplifying" the struct:
 *
 * The real Win32 `INPUT` union also contains `MOUSEINPUT` and `HARDWAREINPUT`,
 * and is sized by its *largest* member — `MOUSEINPUT` (32 bytes on 64-bit),
 * not `KEYBDINPUT` (24 bytes). Modelling only the keyboard member makes
 * `sizeof(INPUT)` come out as 32 instead of the real 40, and `SendInput`
 * validates its `cbSize` argument against its own internal `sizeof(INPUT)` —
 * a mismatch is rejected with `ERROR_INVALID_PARAMETER` (87), *silently*: the
 * call returns 0 with no exception, so this fails invisibly rather than
 * loudly. `MOUSEINPUT`/`HARDWAREINPUT` are unused by name here but must stay
 * in the union so it — and the whole struct — has the correct size.
 */

import koffi from 'koffi';

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

// -- struct layout --------------------------------------------------------

koffi.struct('KEYBDINPUT', {
  wVk: 'uint16',
  wScan: 'uint16',
  dwFlags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr_t',
});

koffi.struct('MOUSEINPUT', {
  dx: 'int32',
  dy: 'int32',
  mouseData: 'uint32',
  dwFlags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr_t',
});

koffi.struct('HARDWAREINPUT', {
  uMsg: 'uint32',
  wParamL: 'int16',
  wParamH: 'uint16',
});

// koffi unions are sized by their largest member automatically — this is the
// exact fix for the bug described above, expressed the koffi way.
koffi.union('INPUT_UNION', {
  ki: 'KEYBDINPUT',
  mi: 'MOUSEINPUT',
  hi: 'HARDWAREINPUT',
});

koffi.struct('INPUT', {
  type: 'uint32',
  union: 'INPUT_UNION',
});

const SendInput = user32.func('uint32 SendInput(uint32 nInputs, INPUT *pInputs, int cbSize)');
const GetLastError = kernel32.func('uint32 GetLastError()');
const SetLastError = kernel32.func('void SetLastError(uint32 dwErrCode)');

const INPUT_KEYBOARD = 1;
const INPUT_MOUSE = 0;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_HWHEEL = 0x01000;
const WHEEL_DELTA = 120;

const INPUT_SIZE = koffi.sizeof('INPUT');

/**
 * Sends one `INPUT` struct and checks the return value + `GetLastError()`
 * explicitly — `SendInput` fails by returning 0 with no exception, so success
 * must never be assumed just because the call was made.
 */
function sendInput(input: Record<string, unknown>): void {
  SetLastError(0);
  const sent = SendInput(1, [input], INPUT_SIZE);
  if (sent !== 1) {
    const errorCode = GetLastError();
    throw new Error(`SendInput rejected the event (GetLastError=${errorCode})`);
  }
}

/** Raises if Windows rejects the input — a malformed struct, or UIPI blocking a higher-integrity foreground window. */
export function sendKeyEvent(vk: number, keyUp: boolean): void {
  sendInput({
    type: INPUT_KEYBOARD,
    union: { ki: { wVk: vk, wScan: 0, dwFlags: keyUp ? KEYEVENTF_KEYUP : 0, time: 0, dwExtraInfo: 0 } },
  });
}

/** Types one Unicode code unit directly, bypassing VK lookup entirely. */
export function sendUnicodeChar(charCode: number, keyUp: boolean): void {
  sendInput({
    type: INPUT_KEYBOARD,
    union: {
      ki: {
        wVk: 0,
        wScan: charCode,
        dwFlags: KEYEVENTF_UNICODE | (keyUp ? KEYEVENTF_KEYUP : 0),
        time: 0,
        dwExtraInfo: 0,
      },
    },
  });
}

export function sendMouseClick(button: 'left' | 'right' | 'middle'): void {
  const [down, up] = {
    left: [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP],
    right: [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP],
    middle: [MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP],
  }[button] as [number, number];

  const base = { dx: 0, dy: 0, mouseData: 0, time: 0, dwExtraInfo: 0 };
  sendInput({ type: INPUT_MOUSE, union: { mi: { ...base, dwFlags: down } } });
  sendInput({ type: INPUT_MOUSE, union: { mi: { ...base, dwFlags: up } } });
}

export function sendMouseWheel(direction: 'up' | 'down' | 'left' | 'right', amount: number): void {
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'down' || direction === 'left' ? -1 : 1;
  const mouseData = sign * amount * WHEEL_DELTA;
  sendInput({
    type: INPUT_MOUSE,
    union: {
      mi: {
        dx: 0,
        dy: 0,
        mouseData,
        dwFlags: horizontal ? MOUSEEVENTF_HWHEEL : MOUSEEVENTF_WHEEL,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  });
}
