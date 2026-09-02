'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { UsbOffIcon, UsbIcon, ErrorOutlineIcon, BlockIcon, ScienceIcon } from '@/components/icons';
import { CONNECTION_LABELS, useDeviceStore } from '@/stores/device-store';
import { palette } from '@/theme/tokens';

const DOT_COLOUR = {
  connected: 'success.main',
  connecting: 'warning.main',
  reconnecting: 'warning.main',
  disconnected: 'text.disabled',
  error: 'error.main',
  unsupported: 'text.disabled',
} as const;

/**
 * Connection state for the top bar.
 *
 * Status is carried by an icon and by text, never by colour alone.
 */
export function ConnectionBadge() {
  const status = useDeviceStore((state) => state.status);
  const device = useDeviceStore((state) => state.device);
  const portInfo = useDeviceStore((state) => state.portInfo);
  const transport = useDeviceStore((state) => state.transport);
  const latencyMs = useDeviceStore((state) => state.latencyMs);
  const error = useDeviceStore((state) => state.error);

  const simulated = transport === 'mock';
  const busy = status === 'connecting' || status === 'reconnecting';

  const icon = busy ? (
    <CircularProgress size={14} thickness={5} />
  ) : status === 'connected' ? (
    simulated ? (
      <ScienceIcon fontSize="small" />
    ) : (
      <UsbIcon fontSize="small" />
    )
  ) : status === 'error' ? (
    <ErrorOutlineIcon fontSize="small" />
  ) : status === 'unsupported' ? (
    <BlockIcon fontSize="small" />
  ) : (
    <UsbOffIcon fontSize="small" />
  );

  const detail =
    status === 'connected'
      ? [
          simulated ? 'Simulator' : 'USB Serial',
          portInfo?.vendorId !== undefined
            ? `VID ${portInfo.vendorId.toString(16).toUpperCase().padStart(4, '0')}`
            : null,
          latencyMs !== null ? `${latencyMs} ms` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : (error ?? 'No macro pad connected');

  return (
    <Tooltip title={detail}>
      <Stack
        direction="row"
        spacing={2.5}
        sx={{
          alignItems: 'center',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            color: status === 'connected' ? 'success.main' : 'text.secondary',
          }}
        >
          {icon}
        </Box>

        <Stack sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box
              aria-hidden
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: DOT_COLOUR[status],
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 620, lineHeight: 1.3 }}>
              {status === 'connected' && simulated ? 'Simulated device' : CONNECTION_LABELS[status]}
            </Typography>
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ lineHeight: 1.3, maxWidth: 260, fontSize: '0.7rem' }}
          >
            {status === 'connected' ? (device?.name ?? 'Macro pad') : detail}
          </Typography>
        </Stack>
      </Stack>
    </Tooltip>
  );
}
