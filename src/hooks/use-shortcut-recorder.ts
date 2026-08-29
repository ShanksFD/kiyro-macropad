'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isModifierCode, modifiersFromEvent } from '@/lib/actions/keys';
import type { Modifier } from '@/lib/actions/keys';

export interface RecordedShortcut {
  modifiers: Modifier[];
  key: string;
}

interface Options {
  onCapture: (shortcut: RecordedShortcut) => void;
}

/**
 * Captures the next key combination the user presses.
 *
 * While recording, key events are swallowed in the capture phase so browser and
 * application shortcuts (Ctrl+S, Ctrl+W, Tab navigation) do not fire. Escape
 * always cancels rather than being recorded.
 */
export function useShortcutRecorder({ onCapture }: Options) {
  const [recording, setRecording] = useState(false);
  const [pressed, setPressed] = useState<Modifier[]>([]);
  const onCaptureRef = useRef(onCapture);

  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  const stop = useCallback(() => {
    setRecording(false);
    setPressed([]);
  }, []);

  const start = useCallback(() => {
    setPressed([]);
    setRecording(true);
  }, []);

  useEffect(() => {
    if (!recording) return;

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
  }, [recording, stop]);

  return { recording, pressed, start, stop };
}
