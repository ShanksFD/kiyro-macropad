#pragma once

#include <Arduino.h>

#include "config_store.h"

// Longest line accepted from the host. Larger than KIYRO_MAX_CONFIG_BYTES so an
// oversized SET_CONFIG can be recognised and rejected rather than truncated
// into something that happens to parse.
#define KIYRO_RX_BUFFER_BYTES 3584

/**
 * Newline-delimited command handling.
 *
 * Every command produces exactly one response line, so the host can pair a
 * reply with the command that caused it without any sequence numbers.
 */
class Protocol {
 public:
  explicit Protocol(ConfigStore &store) : store_(store) {}

  // Drains the serial input and handles any complete lines.
  void poll();

  // Emits an input event line, e.g. `BTN:21`.
  static void emitEvent(const char *event);
  static void emitEvent(const char *prefix, int value);

 private:
  ConfigStore &store_;
  char buffer_[KIYRO_RX_BUFFER_BYTES];
  size_t length_ = 0;
  // Set when a line overruns the buffer: the rest of it is discarded.
  bool overflow_ = false;

  void handleLine(const char *line);
  static void reply(const char *value);
  static void replyError(const char *reason);
};
