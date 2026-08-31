'use client';

import { useCallback, useEffect } from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { SaveIcon, DownloadIcon, CheckCircleOutlineIcon, EditNoteIcon } from '@/components/icons';
import { downloadProfile } from '@/lib/profiles/io';
import { useActiveDevice } from '@/stores/device-store';
import { useEditorStore } from '@/stores/editor-store';
import { useActiveProfile, useProfileStore } from '@/stores/profile-store';
import { useUiStore } from '@/stores/ui-store';

/**
 * Saving, for a host-configured device.
 *
 * Saving means writing the profile to this computer's storage — the device
 * has no configuration protocol and nothing is transmitted to it. The copy
 * says "locally" everywhere for that reason.
 */
export function SaveControls({ compact = false }: { compact?: boolean }) {
  const device = useActiveDevice();
  const isDirty = useEditorStore((state) => state.isDirty);
  const draft = useEditorStore((state) => state.draft);
  const profileId = useEditorStore((state) => state.profileId);
  const markSaved = useEditorStore((state) => state.markSaved);
  const saveBindings = useProfileStore((state) => state.saveBindings);
  const activeProfile = useActiveProfile();
  const notify = useUiStore((state) => state.notify);
  const autoSave = useUiStore((state) => state.preferences.autoSaveLocal);

  const saveLocal = useCallback(
    (announce = true) => {
      if (!profileId) return;
      const saved = saveBindings(profileId, draft);
      if (!saved) return;
      markSaved(draft);
      if (announce) notify('Profile saved.');
    },
    [draft, markSaved, notify, profileId, saveBindings],
  );

  useEffect(() => {
    if (!autoSave || !isDirty) return;
    const timer = setTimeout(() => saveLocal(false), 600);
    return () => clearTimeout(timer);
  }, [autoSave, isDirty, saveLocal]);

  return (
    <Stack direction="row" spacing={2.5} sx={{ alignItems: 'center' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', pr: 1 }}>
        <Box sx={{ display: 'flex', color: isDirty ? 'warning.main' : 'success.main' }}>
          {isDirty ? (
            <EditNoteIcon fontSize="small" />
          ) : (
            <CheckCircleOutlineIcon fontSize="small" />
          )}
        </Box>
        {!compact && (
          <Typography variant="caption" color="text.secondary">
            {isDirty ? 'Unsaved changes' : 'Saved on this computer'}
          </Typography>
        )}
      </Stack>

      <Tooltip title="Save this profile on this computer">
        <span>
          <Button
            variant={isDirty ? 'contained' : 'outlined'}
            startIcon={<SaveIcon />}
            disabled={!isDirty || !profileId}
            onClick={() => saveLocal()}
          >
            Save Profile
          </Button>
        </span>
      </Tooltip>

      {!compact && (
        <Tooltip title="Download this profile as JSON">
          <span>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              disabled={!activeProfile}
              onClick={() => {
                if (activeProfile) downloadProfile(activeProfile, device);
              }}
            >
              Export
            </Button>
          </span>
        </Tooltip>
      )}
    </Stack>
  );
}
