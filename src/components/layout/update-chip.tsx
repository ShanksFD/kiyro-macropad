'use client';

import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import { DownloadIcon, ErrorOutlineIcon, RestartAltIcon } from '@/components/icons';
import { useKiyroBridge } from '@/hooks/use-kiyro-bridge';
import { useUpdateStore } from '@/stores/update-store';

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
          <Chip
            label={`Update ${status.version}`}
            icon={<DownloadIcon sx={{ fontSize: 14 }} />}
            size="small"
            color="primary"
            variant="outlined"
            clickable
            onClick={() => void kiyro.updater.download()}
          />
        </Tooltip>
      );

    case 'downloading':
      return (
        <Chip
          label={`Downloading ${status.percent}%`}
          icon={<CircularProgress size={12} thickness={6} />}
          size="small"
          variant="outlined"
          disabled
        />
      );

    case 'downloaded':
      return (
        <Tooltip title={`Restart Kiyro to install ${status.version}`}>
          <Chip
            label="Restart to update"
            icon={<RestartAltIcon sx={{ fontSize: 14 }} />}
            size="small"
            color="primary"
            clickable
            onClick={() => void kiyro.updater.quitAndInstall()}
          />
        </Tooltip>
      );

    case 'error':
      return (
        <Tooltip title={`${status.message} — click to check again`}>
          <Chip
            label="Update failed"
            icon={<ErrorOutlineIcon sx={{ fontSize: 14 }} />}
            size="small"
            color="error"
            variant="outlined"
            clickable
            onClick={() => void kiyro.updater.check().then(setStatus)}
          />
        </Tooltip>
      );

    default:
      return null;
  }
}
