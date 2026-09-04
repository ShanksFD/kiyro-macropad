'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { RestartAltIcon, UndoIcon } from '@/components/icons';
import { layout } from '@/theme/tokens';
import { MacroPadView } from '@/features/device/macro-pad-view';
import { TestModePanel } from '@/features/device/test-mode-panel';
import { useActiveDevice, useDeviceStore } from '@/stores/device-store';
import { useEditorStore } from '@/stores/editor-store';
import { useActiveProfile } from '@/stores/profile-store';
import { useUiStore } from '@/stores/ui-store';
import { ExecutionNotice } from '@/features/execution/execution-notice';
import { ControlInspector } from './control-inspector';
import { SaveControls } from './save-controls';

/** The main editing surface: device on the left, inspector on the right. */
export function ConfigureView() {
  const device = useActiveDevice();
  const connected = useDeviceStore((state) => state.status === 'connected');
  const profile = useActiveProfile();

  const draft = useEditorStore((state) => state.draft);
  const selectedControlId = useEditorStore((state) => state.selectedControlId);
  const select = useEditorStore((state) => state.select);
  const clearAll = useEditorStore((state) => state.clearAll);
  const revert = useEditorStore((state) => state.revert);
  const isDirty = useEditorStore((state) => state.isDirty);

  const testMode = useUiStore((state) => state.testMode);
  const setTestMode = useUiStore((state) => state.setTestMode);
  const confirmBeforeReset = useUiStore((state) => state.preferences.confirmBeforeReset);
  const showRawEvents = useUiStore((state) => state.preferences.showRawEvents);
  const notify = useUiStore((state) => state.notify);

  const [resetOpen, setResetOpen] = useState(false);

  const performReset = () => {
    setResetOpen(false);
    clearAll();
    notify('All bindings cleared. Save to keep this.', 'info');
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={0}
        sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
      >
        <Stack spacing={1}>
          <Typography variant="h1">Configure</Typography>
          <Typography variant="body2" color="text.secondary">
            {device.name} · {profile?.name ?? 'No profile'}
          </Typography>
        </Stack>

        <Stack
          direction="row"
          spacing={3}
          useFlexGap
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          <FormControlLabel
            control={<Switch checked={testMode} onChange={(_event, on) => setTestMode(on)} />}
            label={<Typography variant="body2">Test mode</Typography>}
          />
          <Button variant="outlined" startIcon={<UndoIcon />} disabled={!isDirty} onClick={revert}>
            Discard changes
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<RestartAltIcon />}
            onClick={() => (confirmBeforeReset ? setResetOpen(true) : performReset())}
          >
            Reset profile
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
        <SaveControls />
      </Box>

      <Stack spacing={3}>
        <ExecutionNotice />

        {!connected && (
          <Alert severity="info" variant="outlined">
            No macro pad connected. You can still edit this profile — connect a device to see keys
            light up as you press them.
          </Alert>
        )}
      </Stack>

      <Grid container spacing={4} sx={{ alignItems: 'flex-start' }}>
        <Grid size={{ xs: 12, lg: 7, xl: 6 }}>
          <Stack spacing={4}>
            <MacroPadView
              device={device}
              bindings={draft}
              selectedControlId={selectedControlId}
              onSelectControl={select}
              showEventCodes={testMode || showRawEvents}
            />
            {testMode && <TestModePanel device={device} />}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 5, xl: 6 }}>
          <ControlInspector device={device} />
        </Grid>
      </Grid>

      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset profile?</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2">
            This removes every binding from “{profile?.name ?? 'this profile'}”. The change is not
            saved until you press Save.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={() => setResetOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={performReset}>
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
