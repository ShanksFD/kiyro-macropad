#include "inputs.h"

#include "pins.h"
#include "protocol.h"

namespace {

const bool PRESSED_LEVEL = KIYRO_ACTIVE_LOW ? LOW : HIGH;

struct SwitchState {
  bool pressed = false;
  bool stable = false;
  uint32_t changedAt = 0;
  uint32_t pressedAt = 0;
  bool longSent = false;
};

SwitchState buttonState[KIYRO_BUTTON_COUNT];
SwitchState encoderButtonState[KIYRO_ENCODER_COUNT];

struct EncoderState {
  uint8_t lastPhase = 0;
  int8_t accumulator = 0;
};

EncoderState encoderState[KIYRO_ENCODER_COUNT];

void configureInput(int pin) {
  if (pin == PIN_UNSET) return;
  pinMode(pin, KIYRO_ACTIVE_LOW ? INPUT_PULLUP : INPUT);
}

bool readPressed(int pin) { return digitalRead(pin) == PRESSED_LEVEL; }

/**
 * Debounced edge detection.
 *
 * Returns true on the transition into "pressed"; `held` is set when the switch
 * has been down long enough to count as a long press (once per press).
 */
bool updateSwitch(SwitchState &state, int pin, uint32_t now, bool &held) {
  held = false;
  if (pin == PIN_UNSET) return false;

  bool raw = readPressed(pin);

  if (raw != state.pressed) {
    state.pressed = raw;
    state.changedAt = now;
    return false;
  }

  bool settled = (now - state.changedAt) >= KIYRO_DEBOUNCE_MS;
  if (settled && state.stable != state.pressed) {
    state.stable = state.pressed;
    if (state.stable) {
      state.pressedAt = now;
      state.longSent = false;
      return true;
    }
  }

  if (state.stable && !state.longSent && (now - state.pressedAt) >= KIYRO_LONG_PRESS_MS) {
    state.longSent = true;
    held = true;
  }

  return false;
}

// Quadrature transition table indexed by (previous << 2 | current).
// +1 is one step clockwise, -1 counter-clockwise, 0 is no movement or an
// invalid transition (contact bounce).
const int8_t QUADRATURE[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};

// Four quadrature transitions make one detent on the common EC11-style encoder.
const int8_t STEPS_PER_DETENT = 4;

void pollEncoder(uint8_t index, uint32_t now) {
  const EncoderPins &pins = ENCODER_PINS[index];
  if (pins.a == PIN_UNSET || pins.b == PIN_UNSET) return;

  EncoderState &state = encoderState[index];
  uint8_t phase = static_cast<uint8_t>((digitalRead(pins.a) << 1) | digitalRead(pins.b));
  if (phase == state.lastPhase) return;

  state.accumulator += QUADRATURE[(state.lastPhase << 2) | phase];
  state.lastPhase = phase;

  if (state.accumulator >= STEPS_PER_DETENT) {
    state.accumulator = 0;
    Protocol::emitEvent(index == 0 ? "RIGHT" : "RIGHT2");
  } else if (state.accumulator <= -STEPS_PER_DETENT) {
    state.accumulator = 0;
    Protocol::emitEvent(index == 0 ? "LEFT" : "LEFT2");
  }

  (void)now;
}

}  // namespace

void Inputs::begin() {
  for (int i = 0; i < KIYRO_BUTTON_COUNT; i++) configureInput(BUTTON_PINS[i]);

  for (int i = 0; i < KIYRO_ENCODER_COUNT; i++) {
    configureInput(ENCODER_PINS[i].a);
    configureInput(ENCODER_PINS[i].b);
    configureInput(ENCODER_PINS[i].button);

    if (ENCODER_PINS[i].a != PIN_UNSET && ENCODER_PINS[i].b != PIN_UNSET) {
      encoderState[i].lastPhase =
          static_cast<uint8_t>((digitalRead(ENCODER_PINS[i].a) << 1) | digitalRead(ENCODER_PINS[i].b));
    }
  }

  uint32_t now = millis();
  for (int i = 0; i < KIYRO_BUTTON_COUNT; i++) {
    if (BUTTON_PINS[i] == PIN_UNSET) continue;
    buttonState[i].pressed = readPressed(BUTTON_PINS[i]);
    buttonState[i].stable = buttonState[i].pressed;
    buttonState[i].changedAt = now;
  }
}

void Inputs::poll() {
  uint32_t now = millis();
  bool held = false;

  for (int i = 0; i < KIYRO_BUTTON_COUNT; i++) {
    if (updateSwitch(buttonState[i], BUTTON_PINS[i], now, held)) {
      Protocol::emitEvent("BTN", BUTTON_PINS[i]);
    }
    if (held) Protocol::emitEvent("LONG", BUTTON_PINS[i]);
  }

  for (int i = 0; i < KIYRO_ENCODER_COUNT; i++) {
    pollEncoder(static_cast<uint8_t>(i), now);

    if (updateSwitch(encoderButtonState[i], ENCODER_PINS[i].button, now, held)) {
      Protocol::emitEvent("ENC_BTN", ENCODER_PINS[i].button);
    }
    if (held) Protocol::emitEvent("LONG", ENCODER_PINS[i].button);
  }
}
