#pragma once

#include <Arduino.h>

// Largest configuration document accepted, in bytes. A single NVS string value
// tops out near 4000 bytes; this leaves headroom for the key and metadata.
#define KIYRO_MAX_CONFIG_BYTES 3072

// Device-side cap on a text action. Deliberately smaller than the editor's, so
// oversized snippets are rejected with a clear reason instead of truncated.
#define KIYRO_MAX_TEXT_BYTES 256

#define KIYRO_CONFIG_SCHEMA_VERSION 1

// Machine-readable reasons returned as ERROR:<reason>. Keep in sync with
// docs/device-protocol.md — the host maps these onto user-facing copy.
extern const char *const ERR_BAD_JSON;
extern const char *const ERR_BAD_SCHEMA_VERSION;
extern const char *const ERR_UNKNOWN_CONTROL;
extern const char *const ERR_UNKNOWN_ACTION;
extern const char *const ERR_BAD_ACTION;
extern const char *const ERR_TEXT_TOO_LONG;
extern const char *const ERR_TOO_LARGE;
extern const char *const ERR_NVS_WRITE_FAILED;
extern const char *const ERR_UNKNOWN_COMMAND;

/**
 * Holds the active configuration and owns the NVS namespace.
 *
 * Two levels, mirroring the protocol: `stage()` accepts a document into RAM,
 * `commit()` writes it to flash. Nothing reports success until the value has
 * been read back from NVS and compared.
 */
class ConfigStore {
 public:
  // Loads the stored configuration, or installs the default if none is valid.
  void begin();

  // Validates and accepts a document into RAM. Returns nullptr on success, or
  // an ERR_* reason.
  const char *stage(const String &json);

  // Writes the active configuration to NVS and verifies the read-back.
  // Returns nullptr on success, or an ERR_* reason.
  const char *commit();

  // Clears NVS and returns to the default configuration.
  // Returns nullptr on success, or an ERR_* reason.
  const char *reset();

  const String &active() const { return active_; }

  // True when the active document differs from what is stored in flash.
  bool dirty() const { return dirty_; }

 private:
  String active_;
  bool dirty_ = false;

  static const char *validate(const String &json);
  static String defaultConfig();
};
