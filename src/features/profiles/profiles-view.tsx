'use client';

import { useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import UploadIcon from '@mui/icons-material/Upload';
import { countAssigned } from '@/lib/profiles/factory';
import { downloadProfile, parseProfileFile } from '@/lib/profiles/io';
import type { MacroProfile } from '@/lib/profiles/types';
import { InvalidConfigurationError } from '@/lib/serial/errors';
import { useActiveDevice } from '@/stores/device-store';
import { useEditorStore } from '@/stores/editor-store';
import { useProfileStore } from '@/stores/profile-store';
import { useUiStore } from '@/stores/ui-store';

export function ProfilesView() {
  const device = useActiveDevice();
  const profiles = useProfileStore((state) => state.profiles);
  const activeProfileId = useProfileStore((state) => state.activeProfileId);
  const setActive = useProfileStore((state) => state.setActive);
  const create = useProfileStore((state) => state.create);
  const rename = useProfileStore((state) => state.rename);
  const duplicate = useProfileStore((state) => state.duplicate);
  const remove = useProfileStore((state) => state.remove);
  const adopt = useProfileStore((state) => state.adopt);
  const isDirty = useEditorStore((state) => state.isDirty);
  const notify = useUiStore((state) => state.notify);

  const [menu, setMenu] = useState<{ anchor: HTMLElement; profile: MacroProfile } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<MacroProfile | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<MacroProfile | null>(null);
  const [importError, setImportError] = useState<{ message: string; details: string[] } | null>(
    null,
  );
  const fileInput = useRef<HTMLInputElement | null>(null);

  const handleImport = async (file: File) => {
    setImportError(null);
    try {
      const result = parseProfileFile(await file.text(), device);
      adopt(result.profile);
      notify(
        result.deviceMismatch
          ? `Imported “${result.profile.name}”. It was made for a different device model.`
          : `Imported “${result.profile.name}”.`,
        result.deviceMismatch ? 'warning' : 'success',
      );
    } catch (error) {
      if (error instanceof InvalidConfigurationError) {
        setImportError({ message: error.userMessage, details: error.details });
      } else {
        setImportError({ message: 'That file could not be imported.', details: [] });
      }
    }
  };

  return (
    <Stack spacing={6}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={4}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Stack spacing={1}>
          <Typography variant="h1">Profiles</Typography>
          <Typography variant="body2" color="text.secondary">
            Saved locally in this browser. Export a profile to move it to another machine.
          </Typography>
        </Stack>

        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => fileInput.current?.click()}
          >
            Import
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            New profile
          </Button>
        </Stack>
      </Stack>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImport(file);
          event.target.value = '';
        }}
      />

      {importError && (
        <Alert severity="error" variant="outlined" onClose={() => setImportError(null)}>
          <AlertTitle>Import failed</AlertTitle>
          {importError.message}
          {importError.details.length > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 4 }}>
              {importError.details.map((detail) => (
                <li key={detail}>
                  <Typography variant="caption">{detail}</Typography>
                </li>
              ))}
            </Box>
          )}
        </Alert>
      )}

      <Paper variant="outlined">
        <Stack divider={<Divider />}>
          {profiles.length === 0 && (
            <Box sx={{ p: 8, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No profiles yet. Create one to start assigning actions.
              </Typography>
            </Box>
          )}

          {profiles.map((profile) => {
            const active = profile.id === activeProfileId;
            return (
              <Stack
                key={profile.id}
                direction="row"
                spacing={4}

                sx={{ alignItems: 'center', px: 5, py: 4 }}
              >
                <Stack sx={{ flex: 1, minWidth: 0 }} spacing={0.5}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                    <Typography variant="subtitle2" noWrap>
                      {profile.name}
                    </Typography>
                    {active && <Chip size="small" label="Active" color="primary" />}
                    {profile.deviceId !== device.id && (
                      <Chip size="small" variant="outlined" label="Other device" />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {countAssigned(profile.bindings)} controls assigned · updated{' '}
                    {new Date(profile.updatedAt).toLocaleString()}
                    {profile.description ? ` · ${profile.description}` : ''}
                  </Typography>
                </Stack>

                <Button
                  variant={active ? 'text' : 'outlined'}
                  disabled={active}
                  onClick={() => {
                    if (isDirty) {
                      notify('Save or discard your changes before switching profiles.', 'warning');
                      return;
                    }
                    setActive(profile.id);
                  }}
                >
                  {active ? 'In use' : 'Activate'}
                </Button>

                <IconButton
                  aria-label={`Actions for ${profile.name}`}
                  onClick={(event) => setMenu({ anchor: event.currentTarget, profile })}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Stack>
            );
          })}
        </Stack>
      </Paper>

      <Menu anchorEl={menu?.anchor ?? null} open={menu !== null} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            if (menu) {
              setRenaming(menu.profile);
              setRenameValue(menu.profile.name);
            }
            setMenu(null);
          }}
        >
          <ListItemIcon>
            <DriveFileRenameOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Rename" />
        </MenuItem>

        <MenuItem
          onClick={() => {
            if (menu) {
              const copy = duplicate(menu.profile.id);
              if (copy) notify(`Created “${copy.name}”.`);
            }
            setMenu(null);
          }}
        >
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Duplicate" />
        </MenuItem>

        <MenuItem
          onClick={() => {
            if (menu) downloadProfile(menu.profile, device);
            setMenu(null);
          }}
        >
          <ListItemIcon>
            <DownloadIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Export as JSON" />
        </MenuItem>

        <Divider />

        <MenuItem
          onClick={() => {
            if (menu) setDeleting(menu.profile);
            setMenu(null);
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText primary="Delete" slotProps={{ primary: { sx: { color: 'error.main' } } }} />
        </MenuItem>
      </Menu>

      {/* Create */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New profile</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={newName.trim().length === 0}
            onClick={() => {
              create(newName.trim(), device.id);
              setNewName('');
              setCreateOpen(false);
              notify('Profile created and activated.');
            }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename */}
      <Dialog open={renaming !== null} onClose={() => setRenaming(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename profile</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={() => setRenaming(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={renameValue.trim().length === 0}
            onClick={() => {
              if (renaming) rename(renaming.id, renameValue.trim());
              setRenaming(null);
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete */}
      <Dialog open={deleting !== null} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete profile?</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2">
            “{deleting?.name}” and its bindings will be removed from this browser. This cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              if (deleting) {
                remove(deleting.id);
                notify(`Deleted “${deleting.name}”.`, 'info');
              }
              setDeleting(null);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
