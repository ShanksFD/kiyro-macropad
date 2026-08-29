'use client';

import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ScienceIcon from '@mui/icons-material/Science';
import { useState } from 'react';
import { DEFAULT_DEVICE } from '@/lib/devices/registry';
import { deviceSession } from '@/lib/serial/device-session';
import { useDeviceStore } from '@/stores/device-store';

/**
 * Drives the mock firmware.
 *
 * Only rendered while the simulator transport is active, so nothing here can be
 * mistaken for real hardware output.
 */
export function SimulatorControls() {
  const transport = useDeviceStore((state) => state.transport);
  const status = useDeviceStore((state) => state.status);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (transport !== 'mock' || status !== 'connected') return null;

  const mock = deviceSession.mock;

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<ScienceIcon />}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        Simulate
      </Button>

      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <Typography variant="overline" sx={{ px: 4, color: 'text.secondary' }}>
          Buttons
        </Typography>
        <Stack direction="row" sx={{ px: 3, pb: 2, flexWrap: 'wrap', maxWidth: 260, gap: 1 }}>
          {DEFAULT_DEVICE.buttons.map((button) => (
            <Button
              key={button.id}
              size="small"
              variant="outlined"
              sx={{ minWidth: 36, px: 1 }}
              disabled={button.eventCode === null}
              onClick={() => {
                if (button.eventCode !== null) mock?.emitButton(button.eventCode);
              }}
            >
              {button.shortLabel}
            </Button>
          ))}
        </Stack>

        <MenuItem onClick={() => mock?.emitEncoder(1, 'cw')}>Encoder 1 · clockwise</MenuItem>
        <MenuItem onClick={() => mock?.emitEncoder(1, 'ccw')}>
          Encoder 1 · counter-clockwise
        </MenuItem>
        <MenuItem onClick={() => mock?.emitEncoder(2, 'cw')}>Encoder 2 · clockwise</MenuItem>
        <MenuItem onClick={() => mock?.emitEncoder(2, 'ccw')}>
          Encoder 2 · counter-clockwise
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            mock?.simulateUnplug();
          }}
        >
          Simulate unplug
        </MenuItem>
      </Menu>
    </>
  );
}
