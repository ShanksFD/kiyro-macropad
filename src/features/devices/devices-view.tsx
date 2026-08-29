'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import RemoveIcon from '@mui/icons-material/Remove';
import { DEVICE_REGISTRY } from '@/lib/devices/registry';
import type { DeviceDefinition } from '@/lib/devices/types';
import { ConnectButton } from '@/features/connection/connect-button';
import { useDeviceStore } from '@/stores/device-store';
import { ExecutionChip } from '@/features/execution/execution-notice';
import { useActiveProfile } from '@/stores/profile-store';
import { monoFontFamily } from '@/theme/theme';

const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;

const CAPABILITY_LABELS: Array<{ key: keyof DeviceDefinition['capabilities']; label: string }> = [
  { key: 'buttons', label: 'Buttons' },
  { key: 'encoders', label: 'Encoders' },
  { key: 'encoderButtons', label: 'Encoder buttons' },
  { key: 'inputProtocol', label: 'Sends input events' },
  { key: 'rgb', label: 'Host-controlled RGB' },
  { key: 'deviceConfigProtocol', label: 'Device-side configuration' },
];

export function DevicesView() {
  const connectedId = useDeviceStore((state) => state.device?.id ?? null);

  return (
    <Stack spacing={6}>
      <Stack spacing={1}>
        <Typography variant="h1">Devices</Typography>
        <Typography variant="body2" color="text.secondary">
          Hardware Kiyro knows how to talk to, and exactly what each model supports today.
        </Typography>
      </Stack>

      {DEVICE_REGISTRY.map((device) => (
        <Paper key={device.id} variant="outlined" sx={{ p: 5 }}>
          <Stack spacing={5}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={3}
              sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
            >
              <Stack spacing={1}>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <Typography variant="h3">{device.name}</Typography>
                  {connectedId === device.id && (
                    <Chip size="small" color="primary" label="Connected" />
                  )}
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {device.summary}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: monoFontFamily, color: 'text.disabled' }}
                >
                  VID {hex(device.vendorId)} · PID {hex(device.productId)} · USB Serial/JTAG
                </Typography>
              </Stack>

              {connectedId !== device.id && <ConnectButton />}
            </Stack>

            <Divider />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={6}>
              <Stack spacing={2} sx={{ flex: 1 }}>
                <Typography variant="overline" color="text.secondary">
                  Capabilities
                </Typography>
                <Stack spacing={1}>
                  {CAPABILITY_LABELS.map(({ key, label }) => {
                    const value = device.capabilities[key];
                    return (
                      <Stack
                        key={key}
                        direction="row"
                        spacing={2}
                        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          {label}
                        </Typography>
                        {typeof value === 'number' ? (
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {value}
                          </Typography>
                        ) : value ? (
                          <CheckIcon fontSize="small" color="success" aria-label="Supported" />
                        ) : (
                          <Tooltip title="Not available on this firmware">
                            <RemoveIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                          </Tooltip>
                        )}
                      </Stack>
                    );
                  })}
                </Stack>
              </Stack>

              <Stack spacing={2} sx={{ flex: 1 }}>
                <Typography variant="overline" color="text.secondary">
                  Configuration model
                </Typography>

                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">
                    {device.capabilities.deviceConfigProtocol
                      ? 'Device configured'
                      : 'Host configured'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {device.capabilities.deviceConfigProtocol
                      ? 'This device can store a configuration itself, so bindings travel with the hardware.'
                      : 'The device sends input events to Kiyro; Kiyro decides what each control means. That is how the manufacturer’s own application works too.'}
                  </Typography>
                </Stack>

                <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={
                      device.capabilities.persistenceMode === 'device'
                        ? 'Profiles stored on device'
                        : 'Profiles saved on this computer'
                    }
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={
                      device.executionMode === 'device'
                        ? 'Device performs bindings'
                        : 'Computer performs bindings'
                    }
                  />
                  <ExecutionChip />
                </Stack>

                {device.executionMode === 'host' && <ElectronExecutionDetail />}
              </Stack>
            </Stack>

            <Divider />

            <Stack spacing={2}>
              <Typography variant="overline" color="text.secondary">
                Event mapping
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Control</TableCell>
                      <TableCell>Firmware event</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {device.buttons.map((button) => (
                      <TableRow key={button.id}>
                        <TableCell>{button.label}</TableCell>
                        <TableCell sx={{ fontFamily: monoFontFamily }}>
                          {button.eventCode === null ? '—' : `BTN:${button.eventCode}`}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            variant="outlined"
                            color={button.confidence === 'verified' ? 'default' : 'warning'}
                            label={button.confidence}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {device.encoders.map((encoder) => (
                      <TableRow key={encoder.id}>
                        <TableCell>{encoder.label}</TableCell>
                        <TableCell sx={{ fontFamily: monoFontFamily }}>
                          {encoder.index === 1 ? 'LEFT / RIGHT' : 'LEFT2 / RIGHT2'}
                          {' · '}
                          {encoder.press.eventCode === null
                            ? 'ENC_BTN:?'
                            : `ENC_BTN:${encoder.press.eventCode}`}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            variant="outlined"
                            color="warning"
                            label="press unverified"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Event codes are the GPIO numbers the firmware scans, so this table matches{' '}
                <code>pins.h</code> in the firmware source. Encoder shaft switches have no confirmed
                code yet — use Test mode to capture one.
              </Typography>
            </Stack>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

/** Live detail about Kiyro's own execution engine (Electron's main process). */
function ElectronExecutionDetail() {
  const status = useDeviceStore((state) => state.status);
  const portInfo = useDeviceStore((state) => state.portInfo);
  const activeProfile = useActiveProfile();

  if (status !== 'connected') {
    return (
      <Typography variant="caption" color="text.secondary">
        No macro pad is attached, so bindings are saved but not performed. This updates
        automatically once one is.
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">
        Macro pad attached{portInfo?.label ? ` · ${portInfo.label}` : ''}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {activeProfile
          ? `Active profile: “${activeProfile.name}” (${Object.keys(activeProfile.bindings).length} bindings)`
          : 'No profile selected yet.'}
      </Typography>
    </Stack>
  );
}
