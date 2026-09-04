'use client';

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import {
  AltIcon,
  ArrowBigUpLine,
  BrandWindowsIcon,
  ChevronUpIcon,
  FolderIcon,
  KeyboardCommandKeyIcon,
} from '@/components/icons';
import { APP_LAUNCH_PRESETS } from '@/lib/actions/app-launch-presets';
import {
  DESTRUCTIVE_SYSTEM_COMMANDS,
  DISCORD_LABELS,
  MEDIA_LABELS,
  PROFILE_LABELS,
  SCROLL_LABELS,
  SYSTEM_LABELS,
  VOLUME_LABELS,
} from '@/lib/actions/catalog';
import { MODIFIERS, modifierLabel } from '@/lib/actions/keys';
import type { Modifier } from '@/lib/actions/keys';
import {
  DISCORD_COMMANDS,
  MEDIA_COMMANDS,
  MOUSE_BUTTONS,
  PROFILE_COMMANDS,
  SCROLL_DIRECTIONS,
  SYSTEM_COMMANDS,
  VOLUME_COMMANDS,
} from '@/lib/actions/types';
import type { Action, SystemCommand } from '@/lib/actions/types';
import type { InstalledBrowser } from '@/lib/electron/ipc-types';
import { useKiyroBridge } from '@/hooks/use-kiyro-bridge';
import { fontStack } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { KeySelect } from './key-select';
import { ShortcutRecorder } from './shortcut-recorder';

interface FormProps {
  action: Action;
  onChange: (action: Action) => void;
}

/** Renders the editing form for whichever action type is selected. */
export function ActionForm({ action, onChange }: FormProps) {
  switch (action.type) {
    case 'keyboard':
      return (
        <KeySelect value={action.key} onChange={(key) => onChange({ type: 'keyboard', key })} />
      );

    case 'hotkey':
      return <HotkeyForm action={action} onChange={onChange} />;

    case 'text':
      return (
        <Stack spacing={3}>
          <TextField
            placeholder="Text"
            multiline
            minRows={3}
            maxRows={8}
            value={action.text}
            onChange={(event) => onChange({ type: 'text', text: event.target.value })}
            helperText={`${action.text.length} / 2048 characters`}
            slotProps={{ htmlInput: { maxLength: 2048 } }}
          />
          <Alert severity="info" variant="outlined">
            Text is stored in the profile. Typing it into other applications needs a device or
            companion app that can act as a keyboard — a web page cannot do that on its own.
          </Alert>
        </Stack>
      );

    case 'media':
      return (
        <TextField
          select

          value={action.command}
          onChange={(event) =>
            onChange({
              type: 'media',
              command: event.target.value as (typeof MEDIA_COMMANDS)[number],
            })
          }
        >
          {MEDIA_COMMANDS.map((command) => (
            <MenuItem key={command} value={command}>
              {MEDIA_LABELS[command]}
            </MenuItem>
          ))}
        </TextField>
      );

    case 'volume':
      return (
        <Stack spacing={3}>
          <TextField
            select
            value={action.command}
            onChange={(event) =>
              onChange({
                ...action,
                command: event.target.value as (typeof VOLUME_COMMANDS)[number],
              })
            }
          >
            {VOLUME_COMMANDS.map((command) => (
              <MenuItem key={command} value={command}>
                {VOLUME_LABELS[command]}
              </MenuItem>
            ))}
          </TextField>

          {action.command !== 'mute' && (
            <StepSlider
              label={`Steps per press — about ${(action.step ?? 1) * 2}% volume`}
              value={action.step ?? 1}
              max={10}
              onChange={(step) => onChange({ ...action, step })}
            />
          )}
        </Stack>
      );

    case 'scroll':
      return (
        <Stack spacing={3}>
          <TextField
            select
            value={action.direction}
            onChange={(event) =>
              onChange({
                ...action,
                direction: event.target.value as (typeof SCROLL_DIRECTIONS)[number],
              })
            }
          >
            {SCROLL_DIRECTIONS.map((direction) => (
              <MenuItem key={direction} value={direction}>
                {SCROLL_LABELS[direction]}
              </MenuItem>
            ))}
          </TextField>
          <StepSlider
            label="Scroll amount"
            value={action.amount}
            max={20}
            onChange={(amount) => onChange({ ...action, amount })}
          />
        </Stack>
      );

    case 'mouse':
      return (
        <Stack spacing={3}>
          <TextField
            select
            label="Mouse button"
            value={action.button}
            onChange={(event) =>
              onChange({
                type: 'mouse',
                button: event.target.value as (typeof MOUSE_BUTTONS)[number],
              })
            }
          >
            {MOUSE_BUTTONS.map((button) => (
              <MenuItem key={button} value={button}>
                {`${button[0]?.toUpperCase()}${button.slice(1)} click`}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      );

    case 'system':
      return <SystemForm action={action} onChange={onChange} />;

    case 'profile':
      return (
        <Stack spacing={3}>
          <TextField
            select
            value={action.command}
            onChange={(event) =>
              onChange({
                type: 'profile',
                command: event.target.value as (typeof PROFILE_COMMANDS)[number],
              })
            }
          >
            {PROFILE_COMMANDS.map((command) => (
              <MenuItem key={command} value={command}>
                {PROFILE_LABELS[command]}
              </MenuItem>
            ))}
          </TextField>
          <Alert severity="info" variant="outlined">
            Cycles through your saved profiles in order, wrapping around at the end. Needs at least
            two profiles to do anything. This works even with Kiyro’s window closed.
          </Alert>
        </Stack>
      );

    case 'discord':
      return (
        <Stack spacing={3}>
          <TextField
            select
            value={action.command}
            onChange={(event) =>
              onChange({
                // Spreads `action` (keeps `step`) rather than constructing a
                // fresh object — switching from Toggle Mute to Mic Volume Up
                // shouldn't reset a step the user may have already set on an
                // earlier volume command.
                ...action,
                command: event.target.value as (typeof DISCORD_COMMANDS)[number],
              })
            }
          >
            {DISCORD_COMMANDS.map((command) => (
              <MenuItem key={command} value={command}>
                {DISCORD_LABELS[command]}
              </MenuItem>
            ))}
          </TextField>

          {(action.command === 'micVolumeUp' ||
            action.command === 'micVolumeDown' ||
            action.command === 'outputVolumeUp' ||
            action.command === 'outputVolumeDown') && (
            <StepSlider
              label={`Step — ${action.step ?? 10}% per press`}
              value={action.step ?? 10}
              max={100}
              onChange={(step) => onChange({ ...action, step })}
            />
          )}
        </Stack>
      );

    case 'application':
      return <ApplicationForm action={action} onChange={onChange} />;

    default:
      return (
        <Typography variant="body2" color="text.secondary">
          Pick a category to assign an action.
        </Typography>
      );
  }
}

/** Per-command caveats worth stating in the editor rather than discovering by pressing the key. */
const SYSTEM_NOTES: Partial<Record<SystemCommand, string>> = {
  sleep:
    'Asks Windows to sleep directly. Whether it actually does still depends on the machine’s power plan and drivers.',
  screenshot:
    'Opens the Snipping Tool overlay (Win + Shift + S) so you choose the area — the right choice with more than one monitor.',
  screenshotFull: 'Captures every display at once into one image, saved to Pictures\\Screenshots.',
  displayOff: 'Displays come back on at the next key press or mouse move.',
};

function SystemForm({
  action,
  onChange,
}: {
  action: Extract<Action, { type: 'system' }>;
  onChange: (action: Action) => void;
}) {
  const destructive = DESTRUCTIVE_SYSTEM_COMMANDS.includes(action.command);
  const note = SYSTEM_NOTES[action.command];

  return (
    <Stack spacing={3}>
      <TextField
        select
        value={action.command}
        onChange={(event) =>
          onChange({
            type: 'system',
            command: event.target.value as (typeof SYSTEM_COMMANDS)[number],
          })
        }
      >
        {SYSTEM_COMMANDS.map((command) => (
          <MenuItem key={command} value={command}>
            {SYSTEM_LABELS[command]}
          </MenuItem>
        ))}
      </TextField>

      {destructive && (
        <Alert severity="warning" variant="outlined">
          This runs the moment the key is pressed, with no confirmation, and closes anything you
          have open without saving.
        </Alert>
      )}

      {note && (
        <Alert severity="info" variant="outlined">
          {note}
        </Alert>
      )}
    </Stack>
  );
}

/**
 * `kind: 'path'` needs an exact file location (a "Browse…" native picker is
 * the reliable way to get one right — see `main.ts`'s `AppsBrowseExecutable`
 * handler); `kind: 'uri'` is a URL or a registered custom protocol, so it's
 * just a text field. The preset row (`app-launch-presets.ts`) is the
 * extensible part — add an app there, it shows up here automatically.
 */
function ApplicationForm({
  action,
  onChange,
}: {
  action: Extract<Action, { type: 'application' }>;
  onChange: (action: Action) => void;
}) {
  const kiyro = useKiyroBridge();
  const [browsers, setBrowsers] = useState<InstalledBrowser[]>([]);

  // Read once per mount of this form. The registry is the source of truth
  // (see `electron/win-browsers.ts`), and a browser install/uninstall while
  // this exact form is open is not worth watching for.
  useEffect(() => {
    if (!kiyro) return;
    let cancelled = false;
    void kiyro.apps
      .listBrowsers()
      .then((found) => {
        if (!cancelled) setBrowsers(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [kiyro]);

  const browse = async () => {
    const path = await kiyro?.apps.browseForExecutable();
    if (!path) return;
    const inferredName =
      path
        .split(/[/\\]/)
        .pop()
        ?.replace(/\.[^.]+$/, '') ?? path;
    onChange({
      type: 'application',
      label: action.label || inferredName,
      target: path,
      kind: 'path',
    });
  };

  return (
    <Stack spacing={3}>
      {browsers.length > 0 && (
        <Stack spacing={1.5}>
          <Typography variant="caption" color="text.secondary">
            Browsers on this computer
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            {browsers.map((browser) => (
              <Chip
                key={browser.id}
                label={browser.isDefault ? `${browser.name} (default)` : browser.name}
                onClick={() =>
                  onChange({
                    type: 'application',
                    label: browser.name,
                    target: browser.path,
                    kind: 'path',
                  })
                }
                variant={action.target === browser.path ? 'filled' : 'outlined'}
                color={action.target === browser.path ? 'primary' : 'default'}
                clickable
              />
            ))}
          </Box>
        </Stack>
      )}

      <Stack spacing={1.5}>
        <Typography variant="caption" color="text.secondary">
          Quick pick
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          {APP_LAUNCH_PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              label={preset.label}
              onClick={() => onChange(preset.action)}
              variant={action.target === preset.action.target ? 'filled' : 'outlined'}
              color={action.target === preset.action.target ? 'primary' : 'default'}
              clickable
            />
          ))}
        </Box>
      </Stack>

      <TextField
        value={action.label}
        placeholder="Name"
        onChange={(event) => onChange({ ...action, label: event.target.value })}
      />

      <ToggleButtonGroup
        exclusive
        size="small"
        value={action.kind}
        onChange={(_event, kind: 'path' | 'uri' | null) => {
          if (kind) onChange({ ...action, kind, target: '' });
        }}
        aria-label="Target type"
      >
        <ToggleButton value="path" sx={{ px: 3, textTransform: 'none' }}>
          App on this computer
        </ToggleButton>
        <ToggleButton value="uri" sx={{ px: 3, textTransform: 'none' }}>
          Website or link
        </ToggleButton>
      </ToggleButtonGroup>

      {action.kind === 'path' ? (
        <Stack direction="row" spacing={2}>
          <TextField
            placeholder="Path to executable"
            value={action.target}
            onChange={(event) => onChange({ ...action, target: event.target.value })}
            sx={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            startIcon={<FolderIcon />}
            onClick={() => void browse()}
            sx={{ flexShrink: 0 }}
          >
            Browse…
          </Button>
        </Stack>
      ) : (
        <TextField
          label="URL or link"
          placeholder="https://example.com or discord://"
          value={action.target}
          onChange={(event) => onChange({ ...action, target: event.target.value })}
        />
      )}
    </Stack>
  );
}

/** Control has no universal glyph — a thin caret is the closest real keycap convention (macOS prints literally that for it). Meta is platform-specific, handled separately below. */
const MODIFIER_ICON: Record<Exclude<Modifier, 'Meta'>, React.ComponentType<{ sx?: object }>> = {
  Control: ChevronUpIcon,
  Shift: ArrowBigUpLine,
  Alt: AltIcon,
};

function HotkeyForm({
  action,
  onChange,
}: {
  action: Extract<Action, { type: 'hotkey' }>;
  onChange: (action: Action) => void;
}) {
  const platform = useKiyroBridge()?.platform;
  const MetaIcon = platform === 'darwin' ? KeyboardCommandKeyIcon : BrandWindowsIcon;

  return (
    <Stack spacing={3}>
      <ShortcutRecorder
        modifiers={action.modifiers}
        keyCode={action.key}
        onChange={({ modifiers, key }) => onChange({ type: 'hotkey', modifiers, key })}
      />

      <Stack spacing={1.5}>
        <Typography variant="caption" color="text.secondary">
          Modifiers
        </Typography>
        <Box role="group" aria-label="Modifier keys" sx={{ display: 'flex', gap: 1.5 }}>
          {MODIFIERS.map((modifier) => {
            const Icon = modifier === 'Meta' ? MetaIcon : MODIFIER_ICON[modifier];
            const selected = action.modifiers.includes(modifier);
            return (
              <ButtonBase
                key={modifier}
                focusRipple
                aria-pressed={selected}
                onClick={() =>
                  onChange({
                    ...action,
                    modifiers: selected
                      ? action.modifiers.filter((item) => item !== modifier)
                      : [...action.modifiers, modifier],
                  })
                }
                sx={(theme) => ({
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  width: 68,
                  height: 68,
                  borderRadius: `${radius.md}px`,
                  fontFamily: fontStack,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'device.legend',
                  bgcolor: selected ? 'device.keycapAssigned' : 'device.keycap',
                  border: '1px solid',
                  borderColor: selected ? 'primary.main' : 'device.keycapEdge',
                  '&:hover': { bgcolor: selected ? 'device.keycapAssigned' : 'device.keycapHover' },
                  '&.Mui-focusVisible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: 2,
                  },
                  transition: theme.transitions.create(['background-color', 'border-color'], {
                    duration: theme.transitions.duration.shorter,
                  }),
                })}
              >
                <Icon sx={{ fontSize: 16 }} />
                {modifierLabel(modifier)}
              </ButtonBase>
            );
          })}
        </Box>
      </Stack>

      <KeySelect value={action.key} onChange={(key) => onChange({ ...action, key })} />
    </Stack>
  );
}

function StepSlider({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary" id={`${label}-label`}>
        {label}
      </Typography>
      <Slider
        value={value}
        min={1}
        max={max}
        step={1}
        marks
        valueLabelDisplay="auto"
        aria-labelledby={`${label}-label`}
        onChange={(_event, next) => onChange(Array.isArray(next) ? (next[0] ?? 1) : next)}
      />
    </Stack>
  );
}
