'use client';

import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { MEDIA_LABELS, SCROLL_LABELS, SYSTEM_LABELS, VOLUME_LABELS } from '@/lib/actions/catalog';
import { MODIFIERS, modifierLabel } from '@/lib/actions/keys';
import type { Modifier } from '@/lib/actions/keys';
import {
  MEDIA_COMMANDS,
  MOUSE_BUTTONS,
  SCROLL_DIRECTIONS,
  SYSTEM_COMMANDS,
  VOLUME_COMMANDS,
} from '@/lib/actions/types';
import type { Action } from '@/lib/actions/types';
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
            label="Text"
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
          label="Media command"
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
            label="Volume command"
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
              label="Steps per detent"
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
            label="Direction"
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
          <PlannedNotice />
        </Stack>
      );

    case 'system':
      return (
        <Stack spacing={3}>
          <TextField
            select
            label="System command"
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
          <PlannedNotice />
        </Stack>
      );

    case 'application':
      return (
        <Stack spacing={3}>
          <TextField
            label="Name"
            value={action.label}
            onChange={(event) => onChange({ ...action, label: event.target.value })}
          />
          <TextField
            label="Target"
            placeholder="Application path or URL"
            value={action.target}
            onChange={(event) => onChange({ ...action, target: event.target.value })}
            helperText="Stored as text. Kiyro never launches it from the browser."
          />
          <PlannedNotice />
        </Stack>
      );

    default:
      return (
        <Typography variant="body2" color="text.secondary">
          Pick a category to assign an action.
        </Typography>
      );
  }
}

function HotkeyForm({
  action,
  onChange,
}: {
  action: Extract<Action, { type: 'hotkey' }>;
  onChange: (action: Action) => void;
}) {
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
        <ToggleButtonGroup
          size="small"
          value={action.modifiers}
          onChange={(_event, modifiers: Modifier[]) => onChange({ ...action, modifiers })}
          aria-label="Modifier keys"
        >
          {MODIFIERS.map((modifier) => (
            <ToggleButton key={modifier} value={modifier} sx={{ px: 3, textTransform: 'none' }}>
              {modifierLabel(modifier)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
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

function PlannedNotice() {
  return (
    <Alert severity="warning" variant="outlined">
      This action type is planned. It can be configured and exported, but nothing executes it yet.
    </Alert>
  );
}
