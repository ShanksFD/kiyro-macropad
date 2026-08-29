# Kiyro device protocol

Line-oriented ASCII over USB CDC (Web Serial). Every message is one line
terminated with `\r\n`; the parser also accepts a bare `\n` or `\r`.

Everything below is observed on the physical pad. This is the entire protocol:
a two-command handshake and a stream of input events. There is no device-side
configuration protocol, and Kiyro never sends a command the firmware cannot
answer.

---

## Verified on hardware

### Handshake

| Host sends | Device replies | Meaning                      |
| ---------- | -------------- | ---------------------------- |
| `HELLO`    | `READY`        | Firmware is up and listening |
| `PING`     | `PONG`         | Liveness / round-trip time   |

Kiyro considers a device connected only after `HELLO → READY` **and**
`PING → PONG` both complete within 2500 ms. A port that opens but does not
answer is closed again and reported as an error.

### Input events

| Message       | Meaning                                    |
| ------------- | ------------------------------------------ |
| `BTN:<n>`     | Key press, `<n>` is a firmware button code |
| `LEFT`        | Encoder 1, counter-clockwise               |
| `RIGHT`       | Encoder 1, clockwise                       |
| `LEFT2`       | Encoder 2, counter-clockwise               |
| `RIGHT2`      | Encoder 2, clockwise                       |
| `ENC_BTN:<n>` | Encoder button press                       |
| `LONG:<n>`    | Long press                                 |

Unrecognised but well-formed lines are decoded as
`{ type: 'unknown', raw }` and shown in the serial console rather than being
dropped or throwing.

---

## Reference device — ESP32-C3 macro pad

Firmware source: [`firmware/kiyro-macropad`](../firmware/kiyro-macropad).

- MCU: ESP32-C3, 4 MB flash
- USB: Serial/JTAG, VID `0x303A`, PID `0x1001`
- 12 keys, 2 rotary encoders (with buttons), underglow RGB

### Button codes

Captured by pressing each key in physical order.

| Control   | Event    | Status   |
| --------- | -------- | -------- |
| Button 1  | `BTN:21` | verified |
| Button 2  | `BTN:20` | verified |
| Button 3  | `BTN:1`  | verified |
| Button 4  | `BTN:0`  | verified |
| Button 5  | `BTN:10` | verified |
| Button 6  | `BTN:9`  | verified |
| Button 7  | `BTN:3`  | verified |
| Button 8  | `BTN:2`  | verified |
| Button 9  | `BTN:8`  | verified |
| Button 10 | `BTN:7`  | verified |
| Button 11 | `BTN:6`  | verified |
| Button 12 | `BTN:5`  | verified |

Codes are the GPIO numbers the firmware scans, so this table and `BUTTON_PINS`
in `firmware/kiyro-macropad/pins.h` describe the same wiring from both ends.

Key 12 used to look like a duplicate of key 4: the factory sketch scanned only
eleven pins (`21, 20, 1, 0, 10, 9, 3, 2, 8, 7, 6`), so key 12 produced no event
at all and `BTN:0` appeared to cover both. Key 12 is GPIO 5, and the Kiyro
firmware scans it — every key now has its own code, and nothing in the app has
to model an ambiguous event any more.

The physical key 12 switch on the current development unit is broken and does
not produce `BTN:5` when pressed. That is a hardware fault on this one pad, not
a mapping error — the entry above stays as-is and is not something to debug.

### Encoder buttons

The firmware emits `ENC_BTN:<n>` and `LONG:<n>`, but which `<n>` belongs to
which encoder has not been confirmed. Both are therefore marked `unverified`
with `eventCode: null`, and such events resolve to `unmapped` and appear in Test
mode under "Unmapped codes seen in this session". Use that to capture the real
codes, then fill them into `src/lib/devices/esp32c3-macropad.ts`.

### Encoder pulse rate

One physical detent has been observed producing more than one `LEFT`/`RIGHT`
message, but the ratio is not established. `EncoderNormalizer`
(`src/lib/devices/encoder-normalizer.ts`) exists to fold pulses into logical
steps and is configured with `pulsesPerStep: 1` — pass-through — until the real
behaviour is measured. Nothing is throttled or swallowed today.

---

## Configuration lives on the host

The device does not store a configuration, and Kiyro does not ask it to. This is
not a gap to work around — it is how the hardware works, and how the
manufacturer's own application works: its serial worker reads `BTN:` / `LEFT` /
`RIGHT` events, maps them to actions, and keeps its profiles in a local
`config.json`.

Kiyro mirrors that arrangement:

|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| Device          | reports input events                                             |
| Kiyro           | resolves an event to a control, then to a binding                |
| Profiles        | stored in browser local storage (`LocalConfigurationRepository`) |
| Export / import | versioned JSON, validated with Zod on the way in                 |

The capability model states this explicitly on the device definition:

```ts
executionMode: 'host',
capabilities: {
  inputProtocol: true,
  deviceConfigProtocol: false,
  persistenceMode: 'local',
}
```

`deviceConfigProtocol: false` does **not** mean the device is unsupported or
unconfigurable. It means configuration belongs to the host. A future device that
can store its own configuration would set it to `true` and slot in behind
`ConfigurationRepository` without the editor changing.

A parked sketch that would add such a protocol lives in
[`../firmware/`](../firmware). Nothing in the app references it.

## Execution model

`executionMode: 'host'` means the _computer_ performs a binding when a control
is used; the pad only reports that it was used. Kiyro's renderer cannot do that
part on its own — a web page cannot press keys, change the system volume, or
scroll another application, and Kiyro never fakes this by dispatching synthetic
`KeyboardEvent`s, which would look like execution in devtools and do nothing
outside the page.

Two `ActionExecutor` implementations exist, and the UI is honest about which
one is active:

- **`BrowserSandboxExecutor`** (`src/lib/execution/executor.ts`) — what the
  renderer itself would use. Always resolves to
  `{ status: 'unavailable', reason: 'browser-sandbox' }` — recorded, saved,
  never performed.
- **`NativeActionExecutor`** (`electron/native-execution.ts`) — Electron's
  main process, which owns the real serial port directly (only one process
  can hold it, and this is the one that does) and performs bindings for real
  via `SendInput`, ported from the VK tables and struct layout in
  `host/kiyro_host/execution.py` (the original standalone-process proof of
  concept, kept only as a reference — it is not part of the running app).
  Runs synchronously off the serial port's `data` event, with no IPC
  round-trip in the hot path; IPC (`window.kiyro`, `electron/preload.ts`)
  only carries state back to the renderer afterwards, for the UI to mirror.
  Kiyro pushes the active profile to it (`kiyro:set-active-profile`)
  automatically whenever it changes — the main process holds no independent
  profile of its own.

`deriveExecutionAvailability()` combines the Electron bridge's presence and
device attachment into the single `available: true/false` the Configure and
Devices pages actually render, so "Bindings are saved, not performed"
disappears the moment a macro pad is attached, and reappears the moment it
isn't.
