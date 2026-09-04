'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { encodeEvent } from '@/lib/protocol/encoder';
import { describeEvent, findControl } from '@/lib/devices/registry';
import type { DeviceDefinition } from '@/lib/devices/types';
import { useLiveInputStore } from '@/stores/live-input-store';
import { describeAction } from '@/lib/actions/format';
import { monoFontFamily } from '@/theme/theme';
import { Divider } from '@mui/material';

/**
 * Test mode readout.
 *
 * Shows what the firmware actually sent next to the control Kiyro thinks it
 * belongs to — the fastest way to discover a wrong or missing mapping.
 */
export function TestModePanel({ device }: { device: DeviceDefinition }) {
  const last = useLiveInputStore((state) => state.last);
  const unmapped = useLiveInputStore((state) => state.unmapped);
  const dispatch = useLiveInputStore((state) => state.lastDispatch);

  const resolvedLabel = (() => {
    if (!last) return null;
    if (last.resolution.status === 'mapped') {
      return findControl(device, last.resolution.controlId)?.label ?? last.resolution.controlId;
    }
    if (last.resolution.status === 'ambiguous') {
      return last.resolution.controlIds
        .map((id) => findControl(device, id)?.label ?? id)
        .join(' or ');
    }
    return 'Not mapped to any control';
  })();

  const unmappedEntries = Object.entries(unmapped);

  return (
    <Paper variant="outlined" sx={{ p: 4 }}>
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Typography variant="overline" color="text.secondary">
            Test mode
          </Typography>
          <Chip
            size="small"
            label={last?.resolution.status === 'ambiguous' ? 'Ambiguous event' : 'Listening'}
          />
        </Stack>

        {last ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ flexWrap: 'wrap' }} spacing={4}>
            <Stack>
              <Typography variant="caption" color="text.secondary">
                Raw event
              </Typography>
              <Typography sx={{ fontFamily: monoFontFamily, fontWeight: 600 }}>
                {encodeEvent(last.event)}
              </Typography>
            </Stack>
            <Divider
              orientation="vertical"
              flexItem
              sx={{ display: { xs: 'none', sm: 'block' } }}
            />
            <Stack>
              <Typography variant="caption" color="text.secondary">
                Interpreted as
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>{describeEvent(last.event)}</Typography>
            </Stack>
            <Divider
              orientation="vertical"
              flexItem
              sx={{ display: { xs: 'none', sm: 'block' } }}
            />
            <Stack>
              <Typography variant="caption" color="text.secondary">
                Control
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>{resolvedLabel}</Typography>
            </Stack>
            <Divider
              orientation="vertical"
              flexItem
              sx={{ display: { xs: 'none', sm: 'block' } }}
            />
            <Stack>
              <Typography variant="caption" color="text.secondary">
                Bound action
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                {dispatch ? describeAction(dispatch.action).full : 'No action assigned'}
              </Typography>
              {dispatch?.outcome.status === 'unavailable' && (
                // The event reached the action layer; nothing performed it.
                <Typography variant="caption" color="warning.main">
                  Not performed — host execution unavailable
                </Typography>
              )}
            </Stack>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Press a key or turn an encoder on the device. The control will light up here.
          </Typography>
        )}

        {unmappedEntries.length > 0 && (
          <Box>
            <Typography variant="caption" color="warning.main">
              Unmapped codes seen in this session
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
              {unmappedEntries.map(([code, count]) => (
                <Chip
                  key={code}
                  size="small"
                  variant="outlined"
                  label={`${code} × ${count}`}
                  sx={{ fontFamily: monoFontFamily }}
                />
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    </Paper>
  );
}
