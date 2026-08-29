#include "config_store.h"

#include <ArduinoJson.h>
#include <Preferences.h>
#include <ctype.h>
#include <stdlib.h>
#include <string.h>

#include "pins.h"

const char *const ERR_BAD_JSON = "bad_json";
const char *const ERR_BAD_SCHEMA_VERSION = "bad_schema_version";
const char *const ERR_UNKNOWN_CONTROL = "unknown_control";
const char *const ERR_UNKNOWN_ACTION = "unknown_action";
const char *const ERR_BAD_ACTION = "bad_action";
const char *const ERR_TEXT_TOO_LONG = "text_too_long";
const char *const ERR_TOO_LARGE = "too_large";
const char *const ERR_NVS_WRITE_FAILED = "nvs_write_failed";
const char *const ERR_UNKNOWN_COMMAND = "unknown_command";

namespace {

Preferences prefs;

const char *const NVS_NAMESPACE = "kiyro";
const char *const NVS_KEY_CONFIG = "config";

bool isOneOf(const char *value, const char *const *allowed, size_t count) {
  if (value == nullptr) return false;
  for (size_t i = 0; i < count; i++) {
    if (strcmp(value, allowed[i]) == 0) return true;
  }
  return false;
}

const char *const MEDIA_COMMANDS[] = {"playPause", "next", "previous", "stop"};
const char *const VOLUME_COMMANDS[] = {"up", "down", "mute"};
const char *const SCROLL_DIRECTIONS[] = {"up", "down", "left", "right"};
const char *const MOUSE_BUTTONS[] = {"left", "right", "middle"};
const char *const SYSTEM_COMMANDS[] = {"lock", "sleep", "screenshot"};
const char *const MODIFIERS[] = {"Control", "Shift", "Alt", "Meta"};

// Key identifiers are `KeyboardEvent.code` values: letters and digits only.
bool isKeyIdentifier(JsonVariantConst value) {
  if (!value.is<const char *>()) return false;
  const char *key = value.as<const char *>();
  size_t length = strlen(key);
  if (length == 0 || length > 32) return false;
  for (size_t i = 0; i < length; i++) {
    if (!isalnum(static_cast<unsigned char>(key[i]))) return false;
  }
  return true;
}

bool isBoundedInt(JsonVariantConst value, int low, int high) {
  if (!value.is<int>()) return false;
  int number = value.as<int>();
  return number >= low && number <= high;
}

/** Returns nullptr when the action is well formed, otherwise an ERR_* reason. */
const char *validateAction(JsonVariantConst action) {
  if (!action.is<JsonObjectConst>()) return ERR_BAD_ACTION;

  JsonVariantConst typeValue = action["type"];
  if (!typeValue.is<const char *>()) return ERR_BAD_ACTION;
  const char *type = typeValue.as<const char *>();

  if (strcmp(type, "none") == 0) return nullptr;

  if (strcmp(type, "keyboard") == 0) {
    return isKeyIdentifier(action["key"]) ? nullptr : ERR_BAD_ACTION;
  }

  if (strcmp(type, "hotkey") == 0) {
    if (!isKeyIdentifier(action["key"])) return ERR_BAD_ACTION;
    JsonArrayConst modifiers = action["modifiers"].as<JsonArrayConst>();
    if (modifiers.isNull() || modifiers.size() > 4) return ERR_BAD_ACTION;
    for (JsonVariantConst modifier : modifiers) {
      if (!modifier.is<const char *>()) return ERR_BAD_ACTION;
      if (!isOneOf(modifier.as<const char *>(), MODIFIERS, 4)) return ERR_BAD_ACTION;
    }
    return nullptr;
  }

  if (strcmp(type, "text") == 0) {
    JsonVariantConst text = action["text"];
    if (!text.is<const char *>()) return ERR_BAD_ACTION;
    if (strlen(text.as<const char *>()) > KIYRO_MAX_TEXT_BYTES) return ERR_TEXT_TOO_LONG;
    return nullptr;
  }

  if (strcmp(type, "media") == 0) {
    return isOneOf(action["command"].as<const char *>(), MEDIA_COMMANDS, 4) ? nullptr : ERR_BAD_ACTION;
  }

  if (strcmp(type, "volume") == 0) {
    if (!isOneOf(action["command"].as<const char *>(), VOLUME_COMMANDS, 3)) return ERR_BAD_ACTION;
    JsonVariantConst step = action["step"];
    if (!step.isNull() && !isBoundedInt(step, 1, 20)) return ERR_BAD_ACTION;
    return nullptr;
  }

  if (strcmp(type, "scroll") == 0) {
    if (!isOneOf(action["direction"].as<const char *>(), SCROLL_DIRECTIONS, 4)) return ERR_BAD_ACTION;
    return isBoundedInt(action["amount"], 1, 20) ? nullptr : ERR_BAD_ACTION;
  }

  if (strcmp(type, "mouse") == 0) {
    return isOneOf(action["button"].as<const char *>(), MOUSE_BUTTONS, 3) ? nullptr : ERR_BAD_ACTION;
  }

  if (strcmp(type, "system") == 0) {
    return isOneOf(action["command"].as<const char *>(), SYSTEM_COMMANDS, 3) ? nullptr : ERR_BAD_ACTION;
  }

  if (strcmp(type, "application") == 0) {
    JsonVariantConst label = action["label"];
    JsonVariantConst target = action["target"];
    if (!label.is<const char *>() || !target.is<const char *>()) return ERR_BAD_ACTION;
    if (strlen(label.as<const char *>()) > 64) return ERR_BAD_ACTION;
    if (strlen(target.as<const char *>()) > KIYRO_MAX_TEXT_BYTES) return ERR_TEXT_TOO_LONG;
    return nullptr;
  }

  return ERR_UNKNOWN_ACTION;
}

/** `button-<n>` with n in 1..KIYRO_BUTTON_COUNT. */
bool isKnownButtonId(const char *id) {
  if (strncmp(id, "button-", 7) != 0) return false;
  int index = atoi(id + 7);
  return index >= 1 && index <= KIYRO_BUTTON_COUNT;
}

/** `encoder-<n>` with n in 1..KIYRO_ENCODER_COUNT. */
bool isKnownEncoderId(const char *id) {
  if (strncmp(id, "encoder-", 8) != 0) return false;
  int index = atoi(id + 8);
  return index >= 1 && index <= KIYRO_ENCODER_COUNT;
}

const char *const ENCODER_GESTURES[] = {"clockwise", "counterClockwise", "press", "longPress"};

}  // namespace

const char *ConfigStore::validate(const String &json) {
  if (json.length() > KIYRO_MAX_CONFIG_BYTES) return ERR_TOO_LARGE;

  JsonDocument doc;
  if (deserializeJson(doc, json) != DeserializationError::Ok) return ERR_BAD_JSON;
  if (!doc.is<JsonObject>()) return ERR_BAD_JSON;

  JsonVariantConst schemaVersion = doc["schemaVersion"];
  if (!schemaVersion.is<int>() || schemaVersion.as<int>() != KIYRO_CONFIG_SCHEMA_VERSION) {
    return ERR_BAD_SCHEMA_VERSION;
  }

  JsonObjectConst buttons = doc["buttons"].as<JsonObjectConst>();
  if (buttons.isNull()) return ERR_BAD_JSON;
  for (JsonPairConst entry : buttons) {
    if (!isKnownButtonId(entry.key().c_str())) return ERR_UNKNOWN_CONTROL;
    const char *reason = validateAction(entry.value());
    if (reason != nullptr) return reason;
  }

  JsonObjectConst encoders = doc["encoders"].as<JsonObjectConst>();
  if (encoders.isNull()) return ERR_BAD_JSON;
  for (JsonPairConst entry : encoders) {
    if (!isKnownEncoderId(entry.key().c_str())) return ERR_UNKNOWN_CONTROL;
    JsonObjectConst gestures = entry.value().as<JsonObjectConst>();
    if (gestures.isNull()) return ERR_BAD_JSON;

    for (JsonPairConst gesture : gestures) {
      if (!isOneOf(gesture.key().c_str(), ENCODER_GESTURES, 4)) return ERR_UNKNOWN_CONTROL;
      const char *reason = validateAction(gesture.value());
      if (reason != nullptr) return reason;
    }
  }

  return nullptr;
}

String ConfigStore::defaultConfig() {
  return String("{\"schemaVersion\":1,\"buttons\":{},\"encoders\":{}}");
}

void ConfigStore::begin() {
  active_ = defaultConfig();
  dirty_ = false;

  // Read-only open: a namespace that does not exist yet is not an error.
  if (!prefs.begin(NVS_NAMESPACE, true)) return;

  String stored = prefs.getString(NVS_KEY_CONFIG, "");
  prefs.end();

  if (stored.length() == 0) return;

  // Stored data is still validated: flash can be stale, corrupted, or written
  // by an older build.
  if (validate(stored) == nullptr) {
    active_ = stored;
  }
}

const char *ConfigStore::stage(const String &json) {
  const char *reason = validate(json);
  if (reason != nullptr) return reason;

  active_ = json;
  dirty_ = true;
  return nullptr;
}

const char *ConfigStore::commit() {
  if (!prefs.begin(NVS_NAMESPACE, false)) return ERR_NVS_WRITE_FAILED;

  size_t written = prefs.putString(NVS_KEY_CONFIG, active_);
  if (written == 0 && active_.length() > 0) {
    prefs.end();
    return ERR_NVS_WRITE_FAILED;
  }

  // Read back before reporting success: a short write or a full partition must
  // never be reported as SAVED.
  String verify = prefs.getString(NVS_KEY_CONFIG, "");
  prefs.end();

  if (verify != active_) return ERR_NVS_WRITE_FAILED;

  dirty_ = false;
  return nullptr;
}

const char *ConfigStore::reset() {
  if (!prefs.begin(NVS_NAMESPACE, false)) return ERR_NVS_WRITE_FAILED;

  bool cleared = prefs.clear();
  prefs.end();
  if (!cleared) return ERR_NVS_WRITE_FAILED;

  active_ = defaultConfig();
  dirty_ = false;
  return nullptr;
}
