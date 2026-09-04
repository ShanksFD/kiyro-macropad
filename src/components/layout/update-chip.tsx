'use client';

import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import { DownloadIcon, ErrorOutlineIcon, RestartAltIcon } from '@/components/icons';
import { useKiyroBridge } from '@/hooks/use-kiyro-bridge';
import { useUpdateStore } from '@/stores/update-store';
import { Button, IconButton } from '@mui/material';
import { radius } from '@/theme/tokens';

/**
 * The one place an available or downloaded update becomes visible without
 * anyone having to think to open the Help menu and ask (`WindowMenu`'s
 * "Check for Updates…" is the other way in). Renders nothing the rest of the
 * time — idle, still checking, or already up to date all look like no chip
 * at all, on purpose, since none of them need action.
 *
 * `'error'` is deliberately *not* one of those silent states, even though it
 * used to be lumped in with them here: a download or install can fail for
 * real reasons (corrupted download, permissions, antivirus quarantine, low
 * disk space), and `electron-updater` reports that failure correctly — but
 * this component previously rendered nothing for it, same as "nothing to
 * do here." From the outside that looked exactly like "clicked update,
 * nothing happened," with no way to tell a real failure apart from success.
 *
 * Clicking this chip is the action that actually starts a download or an
 * install — see `electron/updater.ts`'s doc comment for why checking runs on
 * its own in the background but those two steps never do.
 *
 * TO PREVIEW A STATE WHILE EDITING THIS FILE: `npm run electron:dev`, open
 * DevTools on the renderer (View → Toggle Developer Tools) and drive
 * `update-store.ts`'s dev-only console handle directly — no real release,
 * download, or GitHub round trip involved, and Fast Refresh keeps whatever
 * you last set as you edit and save this file:
 *
 *   window.__kiyroUpdateStore.getState().setStatus({ state: 'available', version: '9.9.9' })
 *   window.__kiyroUpdateStore.getState().setStatus({ state: 'downloading', percent: 42 })
 *   window.__kiyroUpdateStore.getState().setStatus({ state: 'downloaded', version: '9.9.9' })
 *   window.__kiyroUpdateStore.getState().setStatus({ state: 'error', message: 'Something went wrong' })
 *   window.__kiyroUpdateStore.getState().setStatus({ state: 'idle' }) // back to hidden
 */
export function UpdateChip() {
  const kiyro = useKiyroBridge();
  const status = useUpdateStore((state) => state.status);
  const setStatus = useUpdateStore((state) => state.setStatus);

  if (!kiyro) return null;

  switch (status.state) {
    case 'available':
      return (
        <Tooltip title={`Download Kiyro ${status.version}`}>
          <Button
            variant="contained"
            startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
            size="small"
            color="primary"
            onClick={() => void kiyro.updater.download()}
            sx={{
              whiteSpace: 'nowrap',
            }}
          >
            Update {status.version}
          </Button>
        </Tooltip>
      );

    case 'downloading':
      return (
        <Button
          size="small"
          variant="outlined"
          disabled
          sx={{
            whiteSpace: 'nowrap',
          }}
        >
          Downloading {status.percent}%
        </Button>
      );

    case 'downloaded':
      return (
        <Tooltip title={`Restart Kiyro to install ${status.version}`}>
          <Button
            variant="contained"
            startIcon={<RestartAltIcon sx={{ fontSize: 14 }} />}
            size="small"
            color="primary"
            onClick={() => void kiyro.updater.quitAndInstall()}
            sx={{
              whiteSpace: 'nowrap',
            }}
          >
            Restart to update
          </Button>
        </Tooltip>
      );

    case 'error':
      return (
        <Tooltip title={`${status.message} — click to check again`}>
          <Button
            startIcon={<ErrorOutlineIcon sx={{ fontSize: 14 }} />}
            size="small"
            color="error"
            variant="outlined"
            onClick={() => void kiyro.updater.check().then(setStatus)}
            sx={{
              whiteSpace: 'nowrap',
            }}
          >
            Update failed
          </Button>
        </Tooltip>
      );

    default:
      return null;
  }
}
