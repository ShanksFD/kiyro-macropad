'use client';

import type { Route } from 'next';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LayersIcon from '@mui/icons-material/Layers';
import { countAssigned } from '@/lib/profiles/factory';
import { MacroPadView } from '@/features/device/macro-pad-view';
import { ConnectButton } from '@/features/connection/connect-button';
import { useActiveDevice, useDeviceStore } from '@/stores/device-store';
import { useEditorStore } from '@/stores/editor-store';
import { useActiveProfile, useProfileStore } from '@/stores/profile-store';

export function HomeView() {
  const router = useRouter();
  const device = useActiveDevice();
  const status = useDeviceStore((state) => state.status);
  const supported = useDeviceStore((state) => state.webSerialSupported);
  const profiles = useProfileStore((state) => state.profiles);
  const setActive = useProfileStore((state) => state.setActive);
  const activeProfile = useActiveProfile();
  const draft = useEditorStore((state) => state.draft);
  const isDirty = useEditorStore((state) => state.isDirty);
  const select = useEditorStore((state) => state.select);

  const connected = status === 'connected';

  return (
    <Stack spacing={8}>
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        spacing={8}
        sx={{ alignItems: { lg: 'center' }, justifyContent: 'space-between' }}
      >
        <Stack spacing={4} sx={{ maxWidth: 520 }}>
          <Stack spacing={2}>
            <Typography variant="overline" color="primary.main">
              {connected ? 'Device connected' : 'Kiyro'}
            </Typography>
            <Typography variant="h1">
              {connected ? device.name : 'Configure your keys, encoders and macros.'}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {connected
                ? 'Your macro pad is talking to this browser. Open the configurator to assign actions to every key and encoder gesture.'
                : 'Kiyro talks to programmable macro pads straight from the browser over USB. Connect your device to see its keys light up as you press them.'}
            </Typography>
          </Stack>

          <Stack
            direction="row"
            spacing={3}
            useFlexGap
            sx={{ alignItems: 'center', flexWrap: 'wrap' }}
          >
            {connected ? (
              <Button
                component={NextLink}
                href={'/configure' as Route}
                size="large"
                variant="contained"
                endIcon={<ArrowForwardIcon />}
              >
                Open configurator
              </Button>
            ) : (
              <ConnectButton size="large" />
            )}
            <Button component={NextLink} href={'/devices' as Route} size="large" variant="outlined">
              Supported devices
            </Button>
          </Stack>

          {supported === false && (
            <Alert severity="warning" variant="outlined">
              Device configuration currently requires Chrome or Edge on desktop. You can still edit
              and export profiles here.
            </Alert>
          )}

          {connected && (
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Chip label={`${device.capabilities.buttons} keys`} variant="outlined" />
              <Chip label={`${device.capabilities.encoders} encoders`} variant="outlined" />
              <Chip label="Profiles saved in this browser" variant="outlined" />
            </Stack>
          )}
        </Stack>

        <Box sx={{ flex: 1, minWidth: 0, maxWidth: 700, width: '100%' }}>
          <MacroPadView
            device={device}
            bindings={draft}
            selectedControlId={null}
            connected={connected}
            onSelectControl={(controlId) => {
              // Selecting a control from the overview jumps straight into the editor.
              select(controlId);
              router.push('/configure');
            }}
          />
        </Box>
      </Stack>

      <Divider />

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={5}

        sx={{ alignItems: 'stretch', width: '100%' }}
      >
        <Paper variant="outlined" sx={{ p: 5, flex: 1 }}>
          <Stack spacing={3}>
            <Typography variant="overline" color="text.secondary">
              Current profile
            </Typography>
            {activeProfile ? (
              <>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <LayersIcon fontSize="small" color="primary" />
                  <Typography variant="h3">{activeProfile.name}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {countAssigned(draft)} controls assigned ·{' '}
                  {isDirty ? 'unsaved changes' : 'saved locally'}
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Loading profiles…
              </Typography>
            )}
            <Box>
              <Button component={NextLink} href={'/configure' as Route} variant="outlined">
                Edit bindings
              </Button>
            </Box>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 5, flex: 1 }}>
          <Stack spacing={3}>
            <Typography variant="overline" color="text.secondary">
              Recent profiles
            </Typography>
            {profiles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No profiles yet.
              </Typography>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {profiles.slice(0, 4).map((profile) => (
                  <Stack
                    key={profile.id}
                    direction="row"

                    sx={{ alignItems: 'center', justifyContent: 'space-between', py: 2 }}
                  >
                    <Stack>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {profile.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {countAssigned(profile.bindings)} assigned · updated{' '}
                        {new Date(profile.updatedAt).toLocaleDateString()}
                      </Typography>
                    </Stack>
                    <Button size="small" variant="text" onClick={() => setActive(profile.id)}>
                      Activate
                    </Button>
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Stack>
  );
}
