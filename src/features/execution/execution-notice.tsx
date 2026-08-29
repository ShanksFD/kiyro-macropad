'use client';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { deriveExecutionAvailability } from '@/lib/execution/executor';
import { useDeviceStore } from '@/stores/device-store';

/** Reads whether Kiyro's own execution engine (Electron's main process) has a macro pad attached. */
function useExecutionAvailability() {
  const connected = typeof window !== 'undefined' && Boolean(window.kiyro);
  const deviceConnected = useDeviceStore((state) => state.status === 'connected');
  return deriveExecutionAvailability({ connected, deviceConnected });
}

/**
 * States plainly whether bindings are being performed on the computer.
 *
 * Kiyro can read the pad and store what every control should do, but only
 * its own main process — not the page you're looking at — can actually
 * perform them. This banner disappears the moment a macro pad is attached,
 * and reappears the moment it isn't.
 */
export function ExecutionNotice() {
  const availability = useExecutionAvailability();
  if (availability.available) return null;

  return (
    <Alert severity="info" variant="outlined">
      <AlertTitle sx={{ fontSize: '0.8125rem', fontWeight: 620 }}>
        Bindings are saved, not performed
      </AlertTitle>
      {availability.message}
    </Alert>
  );
}

/** Compact form of the same fact, for headers and the device page. */
export function ExecutionChip() {
  const availability = useExecutionAvailability();

  return (
    <Tooltip
      title={availability.available ? 'Kiyro is performing bindings on this computer.' : availability.message}
    >
      <Chip
        size="small"
        variant="outlined"
        color={availability.available ? 'success' : 'default'}
        label={availability.available ? 'Execution active' : 'Execution unavailable'}
      />
    </Tooltip>
  );
}
