'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

import type { BindingMap } from '@/lib/actions/types';
import type { DeviceDefinition } from '@/lib/devices/types';
import { vars } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { EncoderDial } from './encoder-dial';
import { KeyCap } from './key-cap';

interface Props {
  device: DeviceDefinition;
  bindings: BindingMap;
  selectedControlId: string | null;
  onSelectControl: (controlId: string) => void;
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
}: Props) {
  return (
    <Box
      sx={(theme) => ({
        p: { xs: 4, lg: 6 },
        borderRadius: `${radius.xl}px`,
        bgcolor: 'device.chassis',
        width: '100%',
        mx: 'auto',
        overflow: 'hidden',
        backgroundImage: `radial-gradient(120% 90% at 50% -20%, ${vars(theme).palette.action.hover}, transparent 60%)`,
      })}
    >
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
