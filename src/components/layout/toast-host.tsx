'use client';

import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { useUiStore } from '@/stores/ui-store';

/** Single snackbar outlet — components call `useUiStore.notify()` instead of owning one. */
export function ToastHost() {
  const toast = useUiStore((state) => state.toast);
  const dismiss = useUiStore((state) => state.dismissToast);

  return (
    <Snackbar
      open={toast !== null}
      autoHideDuration={4000}
      onClose={dismiss}
      sx={{ maxWidth: 420 }}
    >
      <Alert
        severity={toast?.severity ?? 'success'}
        variant="outlined"
        onClose={dismiss}
        sx={{ bgcolor: 'background.paper', width: '100%' }}
      >
        {toast?.message}
      </Alert>
    </Snackbar>
  );
}
