'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { FiberManualRecordIcon } from '@/components/icons';
import { keyLabel, modifierLabel } from '@/lib/actions/keys';
import type { Modifier } from '@/lib/actions/keys';
import { useShortcutRecorder } from '@/hooks/use-shortcut-recorder';
import { palette, radius } from '@/theme/tokens';
import { alpha } from '@mui/material';

interface Props {
  modifiers: Modifier[];
  keyCode: string;
  onChange: (value: { modifiers: Modifier[]; key: string }) => void;
}

/** Reusable "press the shortcut" capture surface. */
export function ShortcutRecorder({ modifiers, keyCode, onChange }: Props) {
  const { recording, pressed, start, stop } = useShortcutRecorder({
    onCapture: (shortcut) => onChange(shortcut),
  });

  const shown = recording ? pressed : modifiers;

  return (
    <Stack spacing={2}>
      <Box
        aria-live="polite"
        sx={{
          minHeight: 56,
          px: 3,
          py: 2.5,
          borderRadius: `${radius.md}px`,
          bgcolor: recording ? alpha(palette.error.main, 0.25) : 'device.keycap',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        {recording && shown.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Press a key combination…
          </Typography>
        )}

        {shown.map((modifier) => (
          <Chip
            key={modifier}
            variant="outlined"
            sx={{
              bgcolor: 'device.keycapEdge',
            }}
            label={modifierLabel(modifier)}
          />
        ))}

        {!recording && (
          <Chip
            label={keyLabel(keyCode)}
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 650, bgcolor: 'device.keycapEdge' }}
          />
        )}
      </Box>

      <Stack direction="row" spacing={2}>
        {recording ? (
          <Button variant="outlined" onClick={stop}>
            Cancel
          </Button>
        ) : (
          <Button
            variant="outlined"
            startIcon={<FiberManualRecordIcon color="error" sx={{ fontSize: 12 }} />}
            onClick={start}
          >
            Record shortcut
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
