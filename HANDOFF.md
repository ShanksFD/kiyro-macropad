# Session Handoff

## 1. Objective

Converting the "Kiyro" macro pad configurator (Next.js/MUI web app) into a cross-platform Electron desktop app, so the Electron main process owns serial I/O and does native OS-level key injection (Windows `SendInput`), replacing the old separate Python "Kiyro Host" process. Hardware: ESP32-C3 12-key macro pad + 2 rotary encoders, VID 0x303A / PID 0x1001.

The Electron conversion itself (per the original approved plan at `C:\Users\anass\.claude\plans\imperative-humming-cerf.md`) is functionally complete. The session's current focus shifted to **debugging why the macro pad can no longer connect at all** — a hardware/OS-level serial-port failure unrelated to the Electron work.

## 2. Current state

**Electron conversion — done:**
- Main/preload/IPC architecture, native `SendInput` via `koffi`, Electron `userData` profile + preferences persistence, trimmed custom menu, zoom-reset fix — all implemented and live-verified earlier in this session (before the current handoff point).
- **Background/tray mode** — fully implemented this session: `electron/tray.ts` (new), `electron/main.ts` rewritten for hide-on-close + tray + `--hidden` launch flag, `electron/serial-bridge.ts` `stop()` now logs port release. Also added `app.requestSingleInstanceLock()` to `main.ts` after discovering multiple Electron instances were fighting over COM3 (see §4).
- None of this tray/single-instance work has been build/lint/test-verified — user's standing instruction throughout has been "no tests or builds needed," so this is intentionally unverified beyond manual code read-through.

**In progress / blocking everything else — a hardware connection failure:**
The macro pad stopped connecting entirely. Every attempt to open COM3 fails with:
```
Error: Open (SetCommState): Unknown error code 31   (Windows ERROR_GEN_FAILURE)
```
This has been chased down an extensive elimination chain (see §4) and is **currently unresolved**. This is the live blocker — nothing else in the app can be verified against real hardware until COM3 opens again.

**Not started:** Packaging/distribution (explicitly out of scope per the original plan).

## 3. Key decisions

- **Windows `SendInput` via `koffi`** (not nut-js) — ported proven struct layout/VK tables from the old `host/kiyro_host/execution.py`.
- **`host/` Python package left untouched**, dormant, not deleted.
- **Not `sandbox: true`** in `webPreferences` — a sandboxed preload's `require()` of local project files was unreliable and failed silently, breaking `window.kiyro`. Deliberately kept `contextIsolation: true` + `nodeIntegration: false` instead.
- **Hide-on-close instead of quit** — the main process (not the window) owns the serial connection and execution pipeline, so the window can safely disappear while everything else keeps running. Only the tray's "Quit Kiyro" or an OS-level quit actually tears down (`isQuitting` flag gates this).
- **`app.requestSingleInstanceLock()` added** — hide-on-close makes it easy to forget an old instance is still alive in the tray and launch a competing one; a second instance previously would try to open the already-held COM port and spin retrying forever.
- **`--hidden` CLI flag implemented for "start with Windows"**, but `app.setLoginItemSettings({openAtLogin:true})` was deliberately NOT wired up — enabling auto-launch on its own felt like a consent decision beyond scope; flagged to the user as a natural follow-up.
- **Diagnostic `[kiyro][diag]` console.log lines** were added across `profile-store.ts`, `use-app-bootstrap.ts`, `resolve-control.ts`, `execution-pipeline.ts`, `ipc-handlers.ts`, `main.ts` during an earlier persistence investigation. User explicitly said "do not remove the diagnostics yet" — **do not remove them** unless the user says so.
- **Encoder push-button codes (`ENC_BTN:3`/`ENC_BTN:5`) intentionally left unmapped** — traced end-to-end and determined this is documented, unconfirmed hardware wiring (see `docs/device-protocol.md`, `firmware/kiyro-macropad/pins.h`), not a bug. The user's own logs showed these codes firing on every encoder rotation in both directions — evidence of electrical crosstalk, not real presses. Fabricating a mapping here would introduce false triggers. No code changed for this.

## 4. Important discoveries (the COM3 debugging chain)

Working backward through what's been ruled out, in order:

1. **Not Kiyro/Electron's own code** — a completely fresh Electron process, on its very first-ever open attempt, fails identically. No leaked handle, no race in the app's retry loop.
2. **Arduino IDE was running** and holding the port (a real, separate issue) — fully closed; did not fix the core problem, but is a legitimate thing to keep closed when using Kiyro.
3. **Multiple Kiyro instances competing for the port** — real bug, fixed via `requestSingleInstanceLock()` (see §3). Confirmed via `Get-Process`: 4 stray `electron.exe` processes were found running simultaneously at one point.
4. **Device enumeration is fine** — Device Manager consistently shows `USB Serial Device (COM3)`, `VID_303A&PID_1001`, Status OK, `CM_PROB_NONE`, even across multiple replug cycles.
5. **Driver-level corruption** — uninstalled the device in Device Manager, replugged; Windows reinstalled the driver cleanly (Event Viewer confirmed `usbser` install status 0). Same error persisted after this.
6. **Firmware-level theory (incomplete upload broke the firmware)** — tested by forcing the chip into raw ROM bootloader/download mode: hold physical **button 6** (maps to GPIO9/BOOT per `firmware/kiyro-macropad/pins.h`) while replugging. Same error 31 persisted even here. Since ROM bootloader mode is hardware/ROM-driven and shouldn't depend on app firmware state, this weighs against "bad firmware" as the root cause — though it's not 100% certain the chip actually entered download mode (no independent confirmation was possible, since the port couldn't even be opened to check).
7. **Confirmed across 3 independent tools/stacks**: Node's `serialport` (Kiyro itself), `esptool` v5.3.1 (Python/pyserial, separate venv `esptool-env`), and a standalone script `scripts/serial_test.py` (pyserial) — all three fail with the exact same `PermissionError(13, ... error 31)`.
8. **No other process is holding the port** — checked via `Get-Process` for anything serial-related; nothing found once Arduino IDE and stray Kiyro instances were closed.

**Current working theory:** physical/electrical fault on the board (USB connector or D+/D- lines) — possibly the same marginal connection that caused the original firmware upload to fail partway through — or a PC-side USB power-management quirk that survived a driver reinstall. **Not confirmed either way.**

**Not yet tried:**
- Disable USB selective suspend (Control Panel → Power Options → Advanced settings → USB settings).
- Disable power management on the USB Root Hub in Device Manager (uncheck "Allow the computer to turn off this device to save power").
- Try a genuinely different physical USB port (rear motherboard port, not front panel/hub) and a different cable.
- Test the macro pad on a **different computer entirely** — the cleanest remaining test to separate "this PC" from "the board itself." User said they don't currently have another computer available.
- If all of the above fails: likely board-level hardware repair (reseat/reflow the USB connector, check D+/D- continuity) — not fixable in software.

**Note:** all destructive/admin-requiring diagnostic steps (e.g. `pnputil /disable-device`) failed with "Access is denied" — the working shell in this session is not elevated, so any future admin-level Windows diagnostics need the user to run them directly (elevated PowerShell or Device Manager GUI).

## 5. Files and artifacts

- Plan: `C:\Users\anass\.claude\plans\imperative-humming-cerf.md` (original Electron-conversion plan, approved, phases A–F).
- App root: `kiyro-macropad/` (renamed from `kiyro/`; own git repo, root `Macro Pad/.git` was deleted per user request).
- Key Electron files: `electron/main.ts`, `electron/tray.ts`, `electron/menu.ts`, `electron/serial-bridge.ts`, `electron/preload.ts`, `electron/win-sendinput.ts`, `electron/resolve-control.ts`, `electron/execution-pipeline.ts`, `electron/ipc-handlers.ts`, `electron/profile-storage.ts`, `electron/preferences-storage.ts`.
- Shared framework-free code: `src/lib/protocol/*`, `src/lib/devices/*`, `src/lib/preferences/schema.ts`, `src/lib/electron/ipc-types.ts`.
- Firmware wiring reference: `firmware/kiyro-macropad/pins.h` (button-to-GPIO map, BOOT button = physical button 6), `docs/device-protocol.md` (documents encoder mapping as unconfirmed).
- Firmware backup: `scripts/macro_pad_backup.bin` (4MB, full flash dump) — ready to reflash once the port can be opened again. Also present: `scripts/app0.bin`, `scripts/app0_fast_buttons_20ms.bin`, `scripts/serial_test.py` (pyserial test script used in diagnosis), `scripts/macro_mapper.py`, `scripts/macro_pad_ctrlc.py`.
- `esptool` v5.3.1 installed in a separate Python venv `esptool-env` on the user's machine (not in this repo).

## 6. Risks and uncertainties

**Verified facts:**
- COM3 fails to open (`SetCommState` error 31) across 3 independent software stacks, on a fresh driver install, with no other process holding it.
- The device enumerates correctly at the USB descriptor level (VID/PID/COM assignment correct, Status OK).
- Multiple Kiyro/Electron instances can run simultaneously without a lock (was a real bug; now fixed).

**Assumptions (not confirmed):**
- That holding button 6 during replug actually forced ROM download mode — never independently confirmed, since the port couldn't be opened to verify a handshake.
- That the root cause is hardware/electrical rather than a deeper Windows/driver-stack issue — this is the leading theory but not proven; the "different computer" test that would confirm it has not been run.
- That the interrupted firmware upload and the current connection failure share a root cause (e.g. a marginal USB connection) — plausible narrative, not verified.

**Unresolved questions:**
- Is this a board-hardware fault or a PC-side USB/power-management issue? Unknown until either (a) tested on another computer, or (b) USB selective suspend / hub power management is disabled and retested.
- Whether the tray/single-instance-lock code changes are fully correct — never build/lint/type-checked this session (per explicit "no tests or builds" instruction), only manually read through.

## 7. Next action

Ask the user whether they've tried any of the "not yet tried" steps in §4 (USB selective suspend, hub power management, different port/cable, or a different computer). If the port still won't open after those, treat it as a hardware fault outside the scope of software fixes and stop trying further OS-level workarounds. If the port *does* open, immediately retry `esptool` with `scripts/macro_pad_backup.bin` to restore firmware, then re-verify Kiyro's connect flow end-to-end (including the tray/single-instance changes, which are still unverified against a real device).

## 8. Suggested skills

None of the currently available skills are directly relevant to this task (Electron/serial/firmware debugging has no dedicated skill in this environment). If a build/lint/test pass is eventually requested, no special skill is needed — use the project's own `npm` scripts (`build:electron`, `electron:dev`) directly.
