#pragma once

#include <Arduino.h>

/**
 * Reads the keys and encoders and emits the existing event lines:
 *
 *   BTN:<pin>        key pressed
 *   LEFT / RIGHT     encoder 1 rotated
 *   LEFT2 / RIGHT2   encoder 2 rotated
 *   ENC_BTN:<pin>    encoder shaft pressed
 *   LONG:<pin>       key or shaft held
 *
 * Direct-GPIO scanning, same shape as the original sketch. If the hardware uses
 * a matrix or an expander, this is the only file that has to change: the
 * protocol, validation and storage layers do not know how a press is detected.
 */
class Inputs {
 public:
  void begin();
  void poll();
};
