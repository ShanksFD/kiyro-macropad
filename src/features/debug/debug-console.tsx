'use client';

import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  CloseIcon,
  DeleteSweepIcon,
  NetworkPingIcon,
  PauseIcon,
  PlayArrowIcon,
} from '@/components/icons';
import { describeEvent } from '@/lib/devices/registry';
import { deviceSession } from '@/lib/serial/device-session';
import { useDeviceStore } from '@/stores/device-store';
import { useEventLogStore } from '@/stores/event-log-store';
import { useUiStore } from '@/stores/ui-store';
import { monoFontFamily } from '@/theme/theme';
import { SimulatorControls } from './simulator-controls';

const formatTime = (at: number): string => {
  const date = new Date(at);
  return `${date.toLocaleTimeString('en-GB', { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
};

/**
 * Raw serial traffic, for hardware bring-up.
 *
 * Hidden unless Advanced mode is enabled, and only records while it is open —
 * an always-on log would keep every frame alive for no reason.
 */
export function DebugConsole() {
  const open = useUiStore((state) => state.debugOpen);
  const setDebugOpen = useUiStore((state) => state.setDebugOpen);
  const frames = useEventLogStore((state) => state.frames);
  const paused = useEventLogStore((state) => state.paused);
  const setPaused = useEventLogStore((state) => state.setPaused);
  const setRecording = useEventLogStore((state) => state.setRecording);
  const clear = useEventLogStore((state) => state.clear);
  const status = useDeviceStore((state) => state.status);
  const portInfo = useDeviceStore((state) => state.portInfo);
  const transport = useDeviceStore((state) => state.transport);
  const latencyMs = useDeviceStore((state) => state.latencyMs);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRecording(open);
  }, [open, setRecording]);

  useEffect(() => {
    if (!open || paused) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [frames, open, paused]);

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={() => setDebugOpen(false)}
      slotProps={{ paper: { sx: { height: 360, borderTop: 1, borderColor: 'divider' } } }}
    >
      <Stack sx={{ height: '100%' }}>
        <Stack
          direction="row"
          spacing={3}

          sx={{ alignItems: 'center', px: 5, py: 3, borderBottom: 1, borderColor: 'divider' }}
        >
          <Typography variant="subtitle2">Serial console</Typography>

          <Chip
            size="small"
            variant="outlined"
            label={
              status === 'connected'
                ? `${transport === 'mock' ? 'Simulator' : 'USB Serial'}${
                    portInfo?.vendorId !== undefined
                      ? ` · VID ${portInfo.vendorId.toString(16).toUpperCase()} PID ${portInfo.productId?.toString(16).toUpperCase() ?? '—'}`
                      : ''
                  }${latencyMs !== null ? ` · ${latencyMs} ms` : ''}`
                : 'Not connected'
            }
          />

          <Box sx={{ flex: 1 }} />

          <SimulatorControls />

          <Divider orientation="vertical" flexItem sx={{ my: 1 }} />

          <Tooltip title="Send PING">
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<NetworkPingIcon />}
                disabled={status !== 'connected'}
                onClick={() => void deviceSession.ping()}
              >
                Ping
              </Button>
            </span>
          </Tooltip>

          <FormControlLabel
            control={<Switch checked={!paused} onChange={(_e, on) => setPaused(!on)} />}
            label={
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {paused ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                <Typography variant="caption">{paused ? 'Paused' : 'Live'}</Typography>
              </Stack>
            }
          />

          <Tooltip title="Clear log">
            <IconButton aria-label="Clear log" onClick={clear}>
              <DeleteSweepIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Close console">
            <IconButton aria-label="Close serial console" onClick={() => setDebugOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Box
          ref={scrollRef}
          sx={{ flex: 1, overflow: 'auto', px: 5, py: 3, fontFamily: monoFontFamily }}
        >
          {frames.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No traffic yet. Connect a device or start the simulator, then press a key.
            </Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {frames.map((frame) => (
                <Box
                  component="li"
                  key={frame.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '110px 40px 160px 1fr',
                    gap: 2,
                    py: 0.5,
                    fontSize: '0.75rem',
                  }}
                >
                  <Box sx={{ color: 'text.disabled' }}>{formatTime(frame.at)}</Box>
                  <Box
                    sx={{
                      color: frame.direction === 'tx' ? 'primary.main' : 'success.main',
                      fontWeight: 700,
                    }}
                  >
                    {frame.direction.toUpperCase()}
                  </Box>
                  <Box sx={{ color: 'text.primary' }}>{frame.raw}</Box>
                  <Box sx={{ color: 'text.secondary' }}>
                    {frame.event ? describeEvent(frame.event) : 'Command sent'}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Stack>
    </Drawer>
  );
}
