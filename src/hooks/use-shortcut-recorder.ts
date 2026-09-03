'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isModifierCode, MODIFIERS, modifiersFromEvent } from '@/lib/actions/keys';
import type { Modifier } from '@/lib/actions/keys';

export interface RecordedShortcut {
  modifiers: Modifier[];
  key: string;
}

interface Options {
  onCapture: (shortcut: RecordedShortcut) => void;
}

const isModifier = (value: string): value is Modifier =>
  (MODIFIERS as readonly string[]).includes(value);

/**
 * Captures the next key combination the user presses.
 *
 * Two capture paths, and which one is used is not cosmetic:
 *
 * - **Exclusive capture** (Electron on Windows). The main process installs a
 *   low-level keyboard hook and swallows every keystroke for the duration
 *   (`electron/win-keyboard-hook.ts`). This is the only way to record
 *   combinations the OS or shell claims before any application sees them —
 *   Ctrl+Shift+Esc used to just open Task Manager, Alt+Tab switched windows,
 *   and the Windows key opened Start, all while the recorder sat waiting for
 *   a `keydown` that never arrived.
 *
 * - **DOM capture** (browser, non-Windows, or if the hook cannot be
 *   installed). Key events are swallowed in the capture phase, which stops
 *   *page*-level shortcuts but cannot stop the OS. Reserved combinations stay
 *   unrecordable here; that is a platform limit, not a bug to fix in this file.
 *
 * Escape always cancels rather than being recorded, on both paths.
 */
export function useShortcutRecorder({ onCapture }: Options) {
  const [recording, setRecording] = useState(false);
  const [pressed, setPressed] = useState<Modifier[]>([]);
  /** True while the main process holds the keyboard — the DOM listeners must stay out of the way. */
  const [exclusive, setExclusive] = useState(false);
  const onCaptureRef = useRef(onCapture);

  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  const stop = useCallback(() => {
    setRecording(false);
    setExclusive(false);
    setPressed([]);
    void window.kiyro?.shortcutCapture.stop().catch(() => undefined);
  }, []);

  const start = useCallback(() => {
    setPressed([]);
    setRecording(true);

    const capture = window.kiyro?.shortcutCapture;
    if (!capture) return;

    // Optimistic: the DOM listeners below are harmless while this resolves,
    // and a `false` result simply leaves them as the active path.
    void capture
      .start()
      .then((installed) => setExclusive(installed))
      .catch(() => setExclusive(false));
  }, []);

  // Exclusive path: the main process is the only thing seeing keystrokes, and
  // reports what it captured over IPC.
  useEffect(() => {
    if (!recording) return;
    const capture = window.kiyro?.shortcutCapture;
    if (!capture) return;

    return capture.onUpdate((update) => {
      if (update.kind === 'modifiers') {
        setPressed(update.modifiers.filter(isModifier));
        return;
      }

      if (update.kind === 'cancelled') {
        stop();
        return;
      }

      onCaptureRef.current({
        modifiers: update.modifiers.filter(isModifier),
        key: update.key,
      });
      stop();
    });
  }, [recording, stop]);

  // DOM fallback. Skipped entirely once exclusive capture is confirmed —
  // otherwise a combination the hook let through (Ctrl+Alt+Del, Win+L: both
  // reserved below every hook) could still be recorded here by accident.
  useEffect(() => {
    if (!recording || exclusive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.code === 'Escape') {
        stop();
        return;
      }

      const modifiers = modifiersFromEvent(event);
      if (isModifierCode(event.code)) {
        setPressed(modifiers);
        return;
      }

      onCaptureRef.current({ modifiers, key: event.code });
      stop();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      setPressed(modifiersFromEvent(event));
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [recording, exclusive, stop]);

  // A recorder unmounted mid-capture (the dialog closed, the category
  // switched) must not leave the main process holding the keyboard. Its own
  // timeout would eventually free it, but "eventually" here means seconds of
  // a dead keyboard.
  useEffect(
    () => () => {
      void window.kiyro?.shortcutCapture.stop().catch(() => undefined);
    },
    [],
  );

  return { recording, pressed, exclusive, start, stop };
}
