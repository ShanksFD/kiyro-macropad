'use client';

import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import { DownloadIcon, RestartAltIcon } from '@/components/icons';
import { useKiyroBridge } from '@/hooks/use-kiyro-bridge';
import { useUpdateStore } from '@/stores/update-store';

/**
 * The one place an available or downloaded update becomes visible without
 * anyone having to think to open the Help menu and ask (`WindowMenu`'s
 * "Check for Updates…" is the other way in). Renders nothing the rest of the
 * time — idle, still checking, already up to date, or a failed check all
 * look like no chip at all, on purpose, since none of them need action.
 *
 * Clicking this chip is the action that actually starts a download or an
 * install — see `electron/updater.ts`'s doc comment for why checking runs on
 * its own in the background but those two steps never do.
 */
export function UpdateChip() {
  const kiyro = useKiyroBridge();
  const status = useUpdateStore((state) => state.status);

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

    default:
      return null;
  }
}
