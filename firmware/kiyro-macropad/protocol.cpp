#include "protocol.h"

void Protocol::reply(const char *value) {
  Serial.print(value);
  Serial.print("\r\n");
}

void Protocol::replyError(const char *reason) {
  Serial.print("ERROR:");
  Serial.print(reason);
  Serial.print("\r\n");
}

void Protocol::emitEvent(const char *event) { reply(event); }

void Protocol::emitEvent(const char *prefix, int value) {
  Serial.print(prefix);
  Serial.print(":");
  Serial.print(value);
  Serial.print("\r\n");
}

void Protocol::poll() {
  while (Serial.available() > 0) {
    int incoming = Serial.read();
    if (incoming < 0) return;

    char c = static_cast<char>(incoming);

    if (c == '\n' || c == '\r') {
      if (overflow_) {
        // The line was longer than the buffer; report once, at its end.
        overflow_ = false;
        length_ = 0;
        replyError(ERR_TOO_LARGE);
        continue;
      }
      if (length_ == 0) continue;  // tolerate CRLF and blank lines

      buffer_[length_] = '\0';
      handleLine(buffer_);
      length_ = 0;
      continue;
    }

    if (length_ + 1 >= KIYRO_RX_BUFFER_BYTES) {
      overflow_ = true;
      continue;
    }

    buffer_[length_++] = c;
  }
}

void Protocol::handleLine(const char *line) {
  if (strcmp(line, "HELLO") == 0) {
    reply("READY");
    return;
  }

  if (strcmp(line, "PING") == 0) {
    reply("PONG");
    return;
  }

  if (strcmp(line, "GET_CONFIG") == 0) {
    Serial.print("CONFIG:");
    Serial.print(store_.active());
    Serial.print("\r\n");
    return;
  }

  if (strncmp(line, "SET_CONFIG:", 11) == 0) {
    const char *reason = store_.stage(String(line + 11));
    if (reason != nullptr) {
      replyError(reason);
      return;
    }
    // Accepted into RAM only. Nothing is in flash until SAVE_CONFIG.
    reply("OK");
    return;
  }

  if (strcmp(line, "SAVE_CONFIG") == 0) {
    const char *reason = store_.commit();
    if (reason != nullptr) {
      replyError(reason);
      return;
    }
    reply("SAVED");
    return;
  }

  if (strcmp(line, "RESET_CONFIG") == 0) {
    const char *reason = store_.reset();
    if (reason != nullptr) {
      replyError(reason);
      return;
    }
    reply("RESET");
    return;
  }

  replyError(ERR_UNKNOWN_COMMAND);
}
