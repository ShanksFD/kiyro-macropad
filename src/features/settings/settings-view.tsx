'use client';

import { useCallback, useEffect, useState } from 'react';

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
import type { DiscordStatusPayload, StartupStatus } from '@/lib/electron/ipc-types';
import { useUiStore } from '@/stores/ui-store';
import type { Preferences } from '@/stores/ui-store';

/** A function, not a `Record` — `DiscordStatusPayload` is a discriminated union (carries a message on `'error'`), not a plain string enum a `Record` could key off directly. */
function discordStatusLabel(status: DiscordStatusPayload): string {
  switch (status.state) {
    case 'disconnected':
      return 'Not connected';
    case 'connecting':
      return 'Connecting…';
    case 'authorizing':
      return 'Check Discord for an approval prompt…';
    case 'connected':
      return 'Connected';
    case 'unavailable':
      return 'Discord isn’t running';
    case 'unconfigured':
      return 'Not available in this build';
    case 'error':
      return status.message;
  }
}

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

  // Not a stored preference: the OS login item is the source of truth, since
  // the user can also flip this in Task Manager (see `electron/startup.ts`).
  // Re-read on focus so a change made over there shows up here instead of
  // this toggle contradicting Windows.
  const [startup, setStartup] = useState<StartupStatus | null>(null);
  const [startupBusy, setStartupBusy] = useState(false);

  // `kiyro?.startup`, not just `kiyro`: the preload bridge and this bundle are
  // built separately, and `electron:dev` only compiles the preload once at
  // launch while Next hot-reloads the renderer — so a renderer that knows
  // about a new bridge method routinely runs against a preload that doesn't
  // have it yet. Reaching straight through would take the whole Settings page
  // down with a TypeError; this just leaves the control disabled instead.
  const refreshStartup = useCallback(() => {
    if (!kiyro?.startup) return;
    void kiyro.startup
      .get()
      .then(setStartup)
      // Same skew, one layer down: the handler may not be registered in a
      // main process built before this channel existed, which rejects.
      .catch(() => setStartup(null));
  }, [kiyro]);

  useEffect(() => {
    refreshStartup();
    window.addEventListener('focus', refreshStartup);
    return () => window.removeEventListener('focus', refreshStartup);
  }, [refreshStartup]);

  const toggleStartup = async (enabled: boolean) => {
    if (!kiyro?.startup) return;
    setStartupBusy(true);
    try {
      // The main process replies with the status it read back from the OS
      // afterwards, so a write that didn't take shows as off rather than
      // leaving the switch stuck optimistically on.
      setStartup(await kiyro.startup.set(enabled));
    } catch {
      notify('Could not change the startup setting.', 'error');
    } finally {
      setStartupBusy(false);
    }
  };

  const discordStatus = useDiscordStore((state) => state.status);
  const setDiscordStatus = useDiscordStore((state) => state.setStatus);
  const discordBusy = discordStatus.state === 'connecting' || discordStatus.state === 'authorizing';

  const connectDiscord = async () => {
    if (!kiyro) return;
    const result = await kiyro.discord.connect();
    setDiscordStatus(result);
    if (result.state === 'connected') notify('Connected to Discord.', 'success');
    else if (result.state === 'unavailable') notify('Discord isn’t running.', 'warning');
    else if (result.state === 'unconfigured')
      notify('This build has no Discord integration configured.', 'warning');
    // A real message now, from `DiscordStatus`'s `'error'` variant, instead
    // of a generic "see the console" — this used to be the one place a
    // genuine failure (a rejected token, a scope/permission problem) was
    // completely invisible: the chip just silently stayed "Not connected,"
    // indistinguishable from the button never having done anything.
    else if (result.state === 'error')
      notify(`Could not connect to Discord: ${result.message}`, 'error');
  };

  const disconnectDiscord = async () => {
    if (!kiyro) return;
    await kiyro.discord.disconnect();
    // The main process also pushes this over `onStatus`, but setting it
    // directly here means the button's own disabled state updates in the
    // same tick rather than waiting on that round trip.
    setDiscordStatus({ state: 'disconnected' });
    notify('Disconnected from Discord.', 'info');
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

          <Section title="Startup" description="Whether Kiyro runs automatically when you sign in.">
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(startup?.enabled)}
                  disabled={!startup?.supported || startupBusy}
                  onChange={(_event, checked) => void toggleStartup(checked)}
                />
              }
              label={
                <Stack spacing={0.25}>
                  <Typography variant="body2">Start Kiyro when I sign in (recommended)</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Launches straight to the tray, without opening a window. Your macro pad only
                    works while Kiyro is running, so leaving this on means it keeps working after a
                    restart without you having to open anything.
                  </Typography>
                </Stack>
              }
              sx={{ alignItems: 'flex-start', m: 0, gap: 2 }}
            />

            {startup?.blockedBySystem && (
              <Alert severity="warning" variant="outlined">
                Windows is blocking this. Kiyro is registered to start at sign-in, but it has been
                switched off in Task Manager → Startup apps, so it won’t actually launch. Re-enable
                it there — that setting overrides this one, and Kiyro deliberately doesn’t override
                it back.
              </Alert>
            )}
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
                label={discordStatusLabel(discordStatus)}
                color={
                  discordStatus.state === 'connected'
                    ? 'primary'
                    : discordStatus.state === 'error'
                      ? 'error'
                      : 'default'
                }
                variant={discordStatus.state === 'connected' ? 'filled' : 'outlined'}
                sx={{
                  borderWidth: 0,
                }}
              />
              <Button
                variant="outlined"
                disabled={discordBusy}
                onClick={() => void connectDiscord()}
              >
                {discordStatus.state === 'connected' ? 'Reconnect' : 'Connect to Discord'}
              </Button>
              {discordStatus.state === 'connected' && (
                <Button variant="outlined" color="inherit" onClick={() => void disconnectDiscord()}>
                  Disconnect
                </Button>
              )}
            </Stack>
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
