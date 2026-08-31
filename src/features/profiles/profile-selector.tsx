'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { CheckIcon, ExpandMoreIcon, LayersIcon, OpenInNewIcon } from '@/components/icons';
import NextLink from 'next/link';
import type { Route } from 'next';
import { useActiveProfile, useProfileStore } from '@/stores/profile-store';
import { useEditorStore } from '@/stores/editor-store';
import { useUiStore } from '@/stores/ui-store';

/** Quick profile switch. Warns before discarding unsaved edits. */
export function ProfileSelector() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const profiles = useProfileStore((state) => state.profiles);
  const activeProfileId = useProfileStore((state) => state.activeProfileId);
  const setActive = useProfileStore((state) => state.setActive);
  const active = useActiveProfile();
  const isDirty = useEditorStore((state) => state.isDirty);
  const notify = useUiStore((state) => state.notify);

  const switchTo = (id: string) => {
    setAnchor(null);
    if (id === activeProfileId) return;
    if (isDirty) {
      notify('Save or discard your changes before switching profiles.', 'warning');
      return;
    }
    setActive(id);
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<LayersIcon />}
        endIcon={<ExpandMoreIcon />}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ maxWidth: 220 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active?.name ?? 'No profile'}
        </span>
      </Button>

      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {profiles.map((profile) => (
          <MenuItem
            key={profile.id}
            selected={profile.id === activeProfileId}
            onClick={() => switchTo(profile.id)}
          >
            <ListItemIcon>
              {profile.id === activeProfileId ? <CheckIcon fontSize="small" /> : null}
            </ListItemIcon>
            <ListItemText primary={profile.name} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem component={NextLink} href={'/profiles' as Route} onClick={() => setAnchor(null)}>
          <ListItemIcon>
            <OpenInNewIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Manage profiles" />
        </MenuItem>
      </Menu>
    </>
  );
}
