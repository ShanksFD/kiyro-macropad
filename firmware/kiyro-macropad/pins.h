#pragma once

// ---------------------------------------------------------------------------
// WIRING
// ---------------------------------------------------------------------------
//
// Buttons: confirmed. The twelve keys are on direct GPIO, in physical order:
//
//     21, 20, 1, 0, 10, 9, 3, 2, 8, 7, 6, 5
//
// (The original factory sketch scanned only the first eleven, which is why key
// 12 never produced an event and looked like it shared `BTN:0` with key 4.)
//
// Encoders: NOT confirmed — see the note below. Left as PIN_UNSET.
//
// A control whose pin is PIN_UNSET is skipped by the scanner: it never emits an
// event. It stays configurable and stored, so nothing here pretends hardware
// exists that has not been identified.
// ---------------------------------------------------------------------------

#define PIN_UNSET (-1)

#define KIYRO_BUTTON_COUNT 12
#define KIYRO_ENCODER_COUNT 2

// Physical key order, 1-based: BUTTON_PINS[0] is "button-1".
static const int BUTTON_PINS[KIYRO_BUTTON_COUNT] = {
    21, 20, 1, 0,  // row 1  — buttons 1-4
    10, 9,  3, 2,  // row 2  — buttons 5-8
    8,  7,  6, 5,  // row 3  — buttons 9-12
};

struct EncoderPins {
  int a;       // quadrature phase A
  int b;       // quadrature phase B
  int button;  // shaft switch, PIN_UNSET if not wired
};

// ---------------------------------------------------------------------------
// ENCODER PINS — UNKNOWN, DO NOT GUESS
//
// The GPIO budget on this chip says these cannot be plain GPIO on this board:
//
//   ESP32-C3 pins:      GPIO0-21
//   Reserved for flash: GPIO11-17   (never touch)
//   Reserved for USB:   GPIO18-19   (USB Serial/JTAG D-/D+)
//   Usable:             GPIO0-10, GPIO20, GPIO21   -> 13 pins
//   Used by the keys:   0,1,2,3,5,6,7,8,9,10,20,21 -> 12 pins
//   Left over:          GPIO4                      -> 1 pin
//
// Two encoders need six inputs (A, B, switch x2). One free pin cannot carry
// them, so the encoders must reach the MCU some other way — an expander, a
// shared/analog ladder, or pins multiplexed with the key scan. Until that is
// identified from the board, these stay PIN_UNSET: a wrong value here would
// emit events for controls nobody touched.
//
// When you do identify them, fill them in here. If they are not direct GPIO,
// replace the encoder half of `inputs.cpp` — nothing else in this firmware
// depends on how an input is read.
// ---------------------------------------------------------------------------
static const EncoderPins ENCODER_PINS[KIYRO_ENCODER_COUNT] = {
    {PIN_UNSET, PIN_UNSET, PIN_UNSET},  // encoder-1  (LEFT / RIGHT)
    {PIN_UNSET, PIN_UNSET, PIN_UNSET},  // encoder-2  (LEFT2 / RIGHT2)
};

// Switches are wired to ground and read with the internal pull-up, matching the
// factory sketch (`INPUT_PULLUP`, pressed == LOW).
#define KIYRO_ACTIVE_LOW 1

// GPIO2, GPIO8 and GPIO9 are strapping pins, and GPIO9 is the BOOT button.
// Holding those keys down while the board resets can put it into download mode.
// That is a property of the hardware, not of this firmware.

// Contact bounce window, milliseconds.
#define KIYRO_DEBOUNCE_MS 10

// A press held at least this long also emits LONG:<pin>.
#define KIYRO_LONG_PRESS_MS 600
