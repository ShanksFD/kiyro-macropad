/*
 * Kiyro macro pad firmware — ESP32-C3, USB Serial/JTAG.
 *
 * Adds persistent configuration to the original event-reporting sketch:
 *
 *   HELLO              -> READY
 *   PING               -> PONG
 *   GET_CONFIG         -> CONFIG:<json>
 *   SET_CONFIG:<json>  -> OK | ERROR:<reason>      (staged in RAM)
 *   SAVE_CONFIG        -> SAVED | ERROR:<reason>   (committed to NVS)
 *   RESET_CONFIG       -> RESET | ERROR:<reason>
 *
 * Input events (BTN / LEFT / RIGHT / LEFT2 / RIGHT2 / ENC_BTN / LONG) are
 * unchanged, so an older host still works against this build.
 *
 * The device stores configuration; it does not execute it. There is no HID
 * output here, and the host must not claim otherwise.
 *
 * Requires: ESP32 Arduino core 3.x, ArduinoJson 7.x.
 * Board: "ESP32C3 Dev Module", USB CDC On Boot: Enabled.
 * Wiring lives in pins.h and must be filled in before flashing.
 */

#include "config_store.h"
#include "inputs.h"
#include "protocol.h"

ConfigStore configStore;
Protocol protocol(configStore);
Inputs inputs;

void setup() {
  Serial.begin(115200);

  // USB CDC enumerates a moment after reset; the original sketch waited too.
  delay(1000);

  // Load persisted configuration before any input can be reported.
  configStore.begin();
  inputs.begin();

  // Unsolicited banner, kept from the original firmware. Hosts treat unknown
  // lines as informational, and Kiyro still waits for HELLO -> READY.
  Serial.print("MACRO PAD READY\r\n");
}

void loop() {
  protocol.poll();
  inputs.poll();
}
