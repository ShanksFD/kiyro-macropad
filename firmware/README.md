# Kiyro macro pad firmware

> **Parked — not required, not referenced by the app.**
>
> Kiyro configures this hardware host-side, the same way the manufacturer's own
> application does: the pad reports input events and the computer decides what
> they mean. Nothing in `src/` sends a configuration command, and no user needs
> to flash anything.
>
> This sketch is kept because it is the starting point _if_ device-side storage
> is ever wanted — it adds `GET_CONFIG` / `SET_CONFIG` / `SAVE_CONFIG` /
> `RESET_CONFIG` over NVS on top of the existing event protocol. It has never
> been compiled or flashed. Treat everything below as a design note, not as a
> step you are expected to take.

## Before you flash

**Buttons are ready.** All twelve keys are wired in `pins.h`, in physical order:

```
21, 20, 1, 0, 10, 9, 3, 2, 8, 7, 6, 5
```

The factory sketch scanned only the first eleven, which is why key 12 never
produced an event and looked like a duplicate of key 4 (`BTN:0`). Key 12 is
GPIO 5 and this firmware scans it.

**Encoder pins are unknown, and are left as `PIN_UNSET`.** The two encoders will
not emit events until you fill them in. Everything else — the twelve keys, the
whole configuration protocol, NVS storage — works without them, and the encoder
bindings are still editable and still stored.

They are not guessed because the pin budget says they cannot be plain GPIO here:

|                              |                                          |
| ---------------------------- | ---------------------------------------- |
| ESP32-C3 pins                | GPIO0–21                                 |
| Reserved for SPI flash       | GPIO11–17 (never touch)                  |
| Reserved for USB Serial/JTAG | GPIO18–19                                |
| Usable                       | GPIO0–10, 20, 21 → **13 pins**           |
| Used by the twelve keys      | 0,1,2,3,5,6,7,8,9,10,20,21 → **12 pins** |
| Free                         | **GPIO4 — one pin**                      |

Two encoders need six inputs (A, B and a switch each). One free pin cannot carry
them, so they reach the MCU some other way on this board. Identify that from the
hardware, then either fill `ENCODER_PINS` in `pins.h` (if they turn out to be
direct GPIO) or replace the encoder half of `inputs.cpp`. Nothing else in this
firmware depends on how an input is read.

Note that GPIO2, GPIO8 and GPIO9 are strapping pins and GPIO9 is the BOOT
button: holding those keys down while the board resets can drop it into download
mode. That is the board's wiring, not this firmware.

## Dependencies

- ESP32 Arduino core 3.x (Boards Manager: _esp32 by Espressif Systems_)
- [ArduinoJson](https://arduinojson.org) 7.x (Library Manager)

## Build settings

| Setting          | Value                    |
| ---------------- | ------------------------ |
| Board            | ESP32C3 Dev Module       |
| USB CDC On Boot  | **Enabled**              |
| Flash size       | 4 MB                     |
| Partition scheme | Default 4 MB with SPIFFS |
| Upload speed     | 921600                   |

`USB CDC On Boot` must be enabled or the sketch will not appear as a serial
port at all.

**Storage safety.** This firmware only ever touches its own NVS namespace
(`kiyro`) through the `Preferences` API. It does not erase flash, does not touch
other partitions, and the upload itself writes only the app partition. Take a
full-flash backup first anyway if you want to be able to return to the factory
image — this firmware cannot restore it for you.

### Arduino IDE, step by step

1. **File → Preferences → Additional board manager URLs**, add:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
2. **Tools → Board → Boards Manager**, search `esp32`, install _esp32 by
   Espressif Systems_ (3.x).
3. **Tools → Manage Libraries**, search `ArduinoJson`, install 7.x.
4. **File → Open** → `firmware/kiyro-macropad/kiyro-macropad.ino`.
   The `.h`/`.cpp` files next to it open as tabs automatically; keep them in the
   same folder.
5. **Tools → Board → ESP32 Arduino → ESP32C3 Dev Module**, then set the options
   in the table above. `USB CDC On Boot: Enabled` is the one that matters most.
6. **Tools → Port** → the port the pad is on (COM3 in this project's notes, but
   check the list — it changes).
7. Press **Verify** (✓) first. A clean compile means the pin table and libraries
   are right.
8. Press **Upload** (→).
   If upload fails to start, hold **BOOT**, tap **RESET**, release **BOOT**, and
   upload again. Some ESP32-C3 boards need that; some do not.
9. **Close the Arduino Serial Monitor before using Kiyro.** One application owns
   the port at a time — the serial monitor and the browser cannot share it.

### Or from the command line

```bash
arduino-cli core install esp32:esp32
arduino-cli lib install "ArduinoJson"
arduino-cli compile --fqbn esp32:esp32:esp32c3:cdc_on_boot=cdc firmware/kiyro-macropad
arduino-cli upload  --fqbn esp32:esp32:esp32c3:cdc_on_boot=cdc -p COM3 firmware/kiyro-macropad
```

## Protocol

Full specification, including every `ERROR:<reason>` value, is in
[`../docs/device-protocol.md`](../docs/device-protocol.md).

| Host sends          | Device replies          | Effect                            |
| ------------------- | ----------------------- | --------------------------------- |
| `HELLO`             | `READY`                 | —                                 |
| `PING`              | `PONG`                  | —                                 |
| `GET_CONFIG`        | `CONFIG:<json>`         | returns the active config         |
| `SET_CONFIG:<json>` | `OK` / `ERROR:<reason>` | validates, stages in RAM          |
| `SAVE_CONFIG`       | `SAVED` / `ERROR:...`   | writes to NVS, verifies read-back |
| `RESET_CONFIG`      | `RESET` / `ERROR:...`   | clears NVS, restores defaults     |

One command produces exactly one response line. `SET_CONFIG` never touches
flash; `SAVE_CONFIG` never reports `SAVED` until the value has been read back
from NVS and compared byte for byte.

Limits: 3072 bytes per configuration document, 256 bytes per text action. A
longer line is rejected with `ERROR:too_large` rather than truncated.

## Storage

`Preferences` namespace `kiyro`, key `config`, holding the JSON document. It is
re-validated on boot: a document written by an older or broken build is
discarded in favour of the default rather than being served back.

## Checking it by hand

Serial monitor at **115200**, line ending **Newline** or **Both NL & CR**. Close
it again before using Kiyro — one application owns the port at a time.

| You send                                                                                               | Device answers                                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| _(on boot, unprompted)_                                                                                | `MACRO PAD READY`                                                              |
| `HELLO`                                                                                                | `READY`                                                                        |
| `PING`                                                                                                 | `PONG`                                                                         |
| `GET_CONFIG`                                                                                           | `CONFIG:{"schemaVersion":1,"buttons":{},"encoders":{}}` when nothing is stored |
| `SET_CONFIG:{"schemaVersion":1,"buttons":{"button-1":{"type":"keyboard","key":"KeyA"}},"encoders":{}}` | `OK`                                                                           |
| `SAVE_CONFIG`                                                                                          | `SAVED`                                                                        |
| `GET_CONFIG`                                                                                           | `CONFIG:{…"button-1":{"type":"keyboard","key":"KeyA"}…}`                       |
| `RESET_CONFIG`                                                                                         | `RESET`                                                                        |
| `NONSENSE`                                                                                             | `ERROR:unknown_command`                                                        |
| `SET_CONFIG:{oops`                                                                                     | `ERROR:bad_json`                                                               |
| `SET_CONFIG:{"schemaVersion":9,"buttons":{},"encoders":{}}`                                            | `ERROR:bad_schema_version`                                                     |

Pressing keys prints `BTN:<gpio>` — e.g. key 1 → `BTN:21`, key 12 → `BTN:5`.
Holding one also prints `LONG:<gpio>`. The encoders print nothing until their
pins are known.

Then unplug, plug back in, and send `GET_CONFIG`: `button-1` must still be
there. That single check is the whole point of the firmware.

## Acceptance test (hardware)

This is the check that decides whether device persistence really works. Run it
after flashing; it has **not** been run here — no board was attached to the
machine this firmware was written on.

1. Open Kiyro and press **Connect Device**, pick the port.
   The status should read _Connected_, and the Devices page should show
   **Config protocol detected**.
2. The editor loads whatever the pad has stored (`GET_CONFIG`).
3. Set **Button 1** to a simple action, e.g. Keyboard → `A`.
4. Press **Save to Device**. It must end in _Saved to device_ — that appears
   only after the pad answers `SAVED`, which it sends only after reading the
   value back out of NVS.
5. Unplug the pad (or power-cycle it).
6. Plug it back in and connect again.
7. The editor repopulates from `GET_CONFIG`.
8. **Button 1 still shows the same action.**

If step 4 shows _Could not save to device_, the reason is in the serial console
(Advanced mode → terminal icon) as `ERROR:<reason>`; the local draft is left
untouched and the button becomes _Retry Save_.

The same sequence runs automatically against the simulator in
`tests/device-persistence.test.ts`, so the host side is covered even before a
board is available.
