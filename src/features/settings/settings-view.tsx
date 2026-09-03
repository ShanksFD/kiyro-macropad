'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { BrandDiscordIcon, ScienceIcon } from '@/components/icons';
import { useKiyroBridge } from '@/hooks/use-kiyro-bridge';
import { useDeviceStore } from '@/stores/device-store';
import { useDiscordStore } from '@/stores/discord-store';
import type { DiscordStatusPayload } from '@/lib/electron/ipc-types';
import { useUiStore } from '@/stores/ui-store';
import type { Preferences } from '@/stores/ui-store';

const DISCORD_STATUS_LABEL: Record<DiscordStatusPayload, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  authorizing: 'Check Discord for an approval prompt…',
  connected: 'Connected',
  unavailable: 'Discord isn’t running',
  unconfigured: 'Not available in this build',
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={5}
      sx={{ alignItems: 'flex-start', py: 5 }}
    >
      <Stack spacing={1} sx={{ width: { md: 240 }, flexShrink: 0 }}>
        <Typography variant="subtitle2">{title}</Typography>
        {description && (
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        )}
      </Stack>
      <Stack spacing={3} sx={{ flex: 1, minWidth: 0, width: '100%' }}>
        {children}
      </Stack>
    </Stack>
  );
}

export function SettingsView() {
  const preferences = useUiStore((state) => state.preferences);
  const setPreference = useUiStore((state) => state.setPreference);
  const notify = useUiStore((state) => state.notify);
  const connect = useDeviceStore((state) => state.connect);
  const status = useDeviceStore((state) => state.status);

  const kiyro = useKiyroBridge();
  const discordStatus = useDiscordStore((state) => state.status);
  const setDiscordStatus = useDiscordStore((state) => state.setStatus);
  const discordBusy = discordStatus === 'connecting' || discordStatus === 'authorizing';

  const connectDiscord = async () => {
    if (!kiyro) return;
    const result = await kiyro.discord.connect();
    setDiscordStatus(result);
    if (result === 'connected') notify('Connected to Discord.', 'success');
    else if (result === 'unavailable') notify('Discord isn’t running.', 'warning');
    else if (result === 'unconfigured') notify('This build has no Discord integration configured.', 'warning');
  };

  const toggle = (key: keyof Preferences, label: string, help?: string) => (
    <FormControlLabel
      control={
        <Switch
          checked={Boolean(preferences[key])}
          onChange={(_event, checked) => setPreference(key, checked as never)}
        />
      }
      label={
        <Stack spacing={0.25}>
          <Typography variant="body2">{label}</Typography>
          {help && (
            <Typography variant="caption" color="text.secondary">
              {help}
            </Typography>
          )}
        </Stack>
      }
      sx={{ alignItems: 'flex-start', m: 0, gap: 2 }}
    />
  );

  return (
    <Stack spacing={6}>
      <Stack spacing={1}>
        <Typography variant="h1">Settings</Typography>
        <Typography variant="body2" color="text.secondary">
          Preferences are stored on this computer only.
        </Typography>
      </Stack>

      <Paper variant="outlined" sx={{ px: 5 }}>
        <Stack divider={<Divider />}>
          <Section title="General" description="Layout density">
            <TextField
              select
              value={preferences.density}
              onChange={(event) =>
                setPreference('density', event.target.value as Preferences['density'])
              }
              sx={{ maxWidth: 260 }}
              helperText="Compact tightens the whole interface a little."
            >
              <MenuItem value="comfortable">Comfortable</MenuItem>
              <MenuItem value="compact">Compact</MenuItem>
            </TextField>
          </Section>

          <Section title="Device" description="How Kiyro connects to your macro pad.">
            {toggle(
              'autoReconnect',
              'Reconnect automatically',
              'Reopens a port you have already authorised when the app loads.',
            )}
          </Section>

          <Section
            title="Discord"
            description="Lets Discord actions (mute, deafen, mic volume) talk to Discord directly."
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Chip
                icon={<BrandDiscordIcon sx={{ fontSize: 14 }} />}
                label={DISCORD_STATUS_LABEL[discordStatus]}
                color={discordStatus === 'connected' ? 'primary' : 'default'}
                variant={discordStatus === 'connected' ? 'filled' : 'outlined'}
              />
              <Button variant="outlined" disabled={discordBusy} onClick={() => void connectDiscord()}>
                {discordStatus === 'connected' ? 'Reconnect' : 'Connect to Discord'}
              </Button>
            </Stack>
            <Alert severity="info" variant="outlined">
              A Discord action connects on its own the first time it’s pressed, even without doing
              this here — this button is only for testing the connection ahead of time. The first
              approval shows a one-time prompt inside Discord itself; nothing to do in a browser.
              Requires Discord to be running.
            </Alert>
          </Section>

          <Section title="Configuration" description="Editing and saving behaviour.">
            {toggle(
              'autoSaveLocal',
              'Save changes automatically',
              'Writes edits to the active profile as you make them.',
            )}
            {toggle('confirmBeforeReset', 'Confirm before resetting a profile')}
          </Section>

          <Section
            title="Advanced"
            description="Developer tooling for hardware bring-up. Hidden by default."
          >
            {toggle(
              'advancedMode',
              'Advanced mode',
              'Shows the serial console, protocol diagnostics and the device simulator.',
            )}
            {toggle('showRawEvents', 'Always show raw firmware codes on key caps')}

            {preferences.advancedMode && (
              <>
                <Alert severity="info" variant="outlined">
                  The simulator emulates the reference firmware in the browser: it answers HELLO and
                  PING, and can emit button and encoder events. Nothing it reports comes from real
                  hardware.
                </Alert>
                <Box>
                  <Button
                    variant="outlined"
                    startIcon={<ScienceIcon />}
                    disabled={status === 'connected' || status === 'connecting'}
                    onClick={async () => {
                      await connect({ simulated: true });
                      notify('Simulator started.', 'info');
                    }}
                  >
                    Start simulator
                  </Button>
                </Box>
              </>
            )}
          </Section>
        </Stack>
      </Paper>
    </Stack>
  );
}
