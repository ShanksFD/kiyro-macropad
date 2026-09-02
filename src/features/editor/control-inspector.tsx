'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ContentCopyIcon, ContentPasteIcon, TouchAppIcon } from '@/components/icons';
import { describeAction } from '@/lib/actions/format';
import { NO_ACTION } from '@/lib/actions/types';
import type { Action } from '@/lib/actions/types';
import { findControl } from '@/lib/devices/registry';
import type { DeviceDefinition } from '@/lib/devices/types';
import { useEditorStore } from '@/stores/editor-store';
import { useUiStore } from '@/stores/ui-store';
import { ActionIcon } from './action-icon';
import { ActionPicker } from './action-picker';
import { radius } from '@/theme/tokens';
import { theme, vars } from '@/theme/theme';

const CONFIDENCE_COPY = {
  verified: null,
  ambiguous:
    'This control shares a firmware code with another key, so live highlighting may light both.',
  unverified: 'The firmware code for this control has not been confirmed yet.',
} as const;

/** Fast-edit side panel for whichever control is selected. */
export function ControlInspector({ device }: { device: DeviceDefinition }) {
  const selectedControlId = useEditorStore((state) => state.selectedControlId);
  // The selector must return a stable reference — building the fallback inside
  // it would hand the store a new object on every read and loop forever.
  const binding = useEditorStore((state) =>
    selectedControlId ? (state.draft[selectedControlId] ?? null) : null,
  );
  const action = selectedControlId ? (binding ?? NO_ACTION) : null;
  const setAction = useEditorStore((state) => state.setAction);
  const clipboard = useEditorStore((state) => state.clipboard);
  const copyAction = useEditorStore((state) => state.copyAction);
  const notify = useUiStore((state) => state.notify);

  const control = selectedControlId ? findControl(device, selectedControlId) : undefined;

  if (!control || !selectedControlId || !action) {
    return (
      <Paper
        sx={{
          p: { xs: 4, lg: 6 },
          height: '100%',
          borderRadius: `${radius.xl}px`,
          bgcolor: 'device.chassis',
          backgroundImage: `radial-gradient(120% 90% at 50% -20%, ${vars(theme).palette.action.hover}, transparent 60%)`,
        }}
      >
        <Stack
          spacing={3}
          sx={{ alignItems: 'center', justifyContent: 'center', height: '100%', py: 8 }}
        >
          <TouchAppIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
          <Stack spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle2">No control selected</Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              align="center"
              sx={{ maxWidth: 260 }}
            >
              Pick a key or an encoder gesture on the device to assign an action.
            </Typography>
          </Stack>
        </Stack>
      </Paper>
    );
  }

  const note = CONFIDENCE_COPY[control.confidence];
  const label = describeAction(action);

  const handleChange = (next: Action) => setAction(selectedControlId, next);

  return (
    <Paper
      sx={{
        p: { xs: 4, lg: 6 },
        borderRadius: `${radius.xl}px`,
        bgcolor: 'device.chassis',
        height: '100%',
        overflow: 'auto',
      }}
    >
      <Stack spacing={4}>
        <Stack spacing={2}>
          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Typography variant="h3">{control.label}</Typography>
            <Chip
              label={control.kind === 'button' ? 'Key' : 'Encoder'}
              variant="outlined"
              size="small"
            />
          </Stack>

          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Box sx={{ display: 'flex', color: 'text.secondary' }}>
              <ActionIcon type={action.type} />
            </Box>
            <Typography
              variant="body2"
              color={action.type === 'none' ? 'text.disabled' : 'text.primary'}
            >
              {action.type === 'none' ? 'No action assigned' : label.full}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              disabled={action.type === 'none'}
              onClick={() => {
                copyAction(action);
                notify('Action copied.', 'info');
              }}
            >
              Copy
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentPasteIcon />}
              disabled={clipboard === null}
              onClick={() => {
                if (clipboard) handleChange(clipboard);
              }}
            >
              Paste
            </Button>
          </Stack>
        </Stack>

        {note && (
          <Alert severity="warning" variant="outlined">
            {control.note ?? note}
          </Alert>
        )}

        <Divider />

        <ActionPicker value={action} onChange={handleChange} />
      </Stack>
    </Paper>
  );
}
