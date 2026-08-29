'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import type { BindingMap } from '@/lib/actions/types';
import type { DeviceDefinition } from '@/lib/devices/types';
import { vars } from '@/theme/theme';
import { EncoderDial } from './encoder-dial';
import { KeyCap } from './key-cap';

interface Props {
  device: DeviceDefinition;
  bindings: BindingMap;
  selectedControlId: string | null;
  onSelectControl: (controlId: string) => void;
  /** Test mode: print the firmware code on each cap instead of its index. */
  showEventCodes?: boolean;
  connected?: boolean;
}

/**
 * The device itself.
 *
 * Layout is driven entirely by the device definition, so a future model with a
 * different key count or encoder arrangement renders without touching this file.
 */
export function MacroPadView({
  device,
  bindings,
  selectedControlId,
  onSelectControl,
  showEventCodes = false,
  connected = false,
}: Props) {
  return (
    <Box
      sx={(theme) => ({
        p: { xs: 4, lg: 6 },
        borderRadius: 5,
        bgcolor: 'device.chassis',
        border: '1px solid',
        borderColor: 'device.chassisEdge',
        boxShadow: `0 1px 0 rgba(255,255,255,0.05) inset, 0 18px 40px -24px rgba(0,0,0,0.75)`,
        maxWidth: 760,
        mx: 'auto',
        // A faint sheen so the body reads as a moulded surface, not a panel.
        backgroundImage: `radial-gradient(120% 90% at 50% -20%, ${vars(theme).palette.action.hover}, transparent 60%)`,
      })}
    >
      <Stack
        direction="row"

        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 4, px: 1 }}
      >
        <Typography variant="caption" sx={{ color: 'device.legendMuted', fontWeight: 620 }}>
          {device.name}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          label={connected ? 'Live' : 'Offline'}
          sx={{ color: 'device.legendMuted', borderColor: 'device.keycapEdge' }}
        />
      </Stack>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={3}
        sx={{ alignItems: 'stretch', mb: 4 }}
      >
        {device.encoders.map((encoder) => (
          <EncoderDial
            key={encoder.id}
            encoder={encoder}
            bindings={bindings}
            selectedControlId={selectedControlId}
            onSelect={onSelectControl}
          />
        ))}
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${device.layout.columns}, minmax(0, 1fr))`,
          gap: { xs: 2.5, lg: 3 },
        }}
      >
        {device.buttons.map((button) => (
          <KeyCap
            key={button.id}
            button={button}
            action={bindings[button.id]}
            selected={selectedControlId === button.id}
            showEventCode={showEventCodes}
            onSelect={onSelectControl}
          />
        ))}
      </Box>
    </Box>
  );
}
