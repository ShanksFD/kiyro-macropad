'use client';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { RotateRightIcon, RotateLeftIcon, TouchAppIcon, TimerIcon, HelpOutlineIcon } from '@/components/icons';
import { describeAction } from '@/lib/actions/format';
import type { Action, BindingMap } from '@/lib/actions/types';
import type { ControlDescriptor, EncoderDescriptor } from '@/lib/devices/types';
import { useLiveInputStore } from '@/stores/live-input-store';
import { radius } from '@/theme/tokens';

interface Props {
  encoder: EncoderDescriptor;
  bindings: BindingMap;
  selectedControlId: string | null;
  onSelect: (controlId: string) => void;
}

const ROW_ICONS = {
  cw: <RotateRightIcon sx={{ fontSize: 16 }} />,
  ccw: <RotateLeftIcon sx={{ fontSize: 16 }} />,
  press: <TouchAppIcon sx={{ fontSize: 16 }} />,
  long: <TimerIcon sx={{ fontSize: 16 }} />,
};

/**
 * A rotary encoder: the knob plus its four assignable gestures.
 *
 * The knob tilts in the direction the hardware actually turned, so a physical
 * twist is confirmed visually without reading any text.
 */
export function EncoderDial({ encoder, bindings, selectedControlId, onSelect }: Props) {
  const active = useLiveInputStore((state) => state.active);
  const turningCw = active[encoder.clockwise.id] !== undefined;
  const turningCcw = active[encoder.counterClockwise.id] !== undefined;
  const pressed = active[encoder.press.id] !== undefined;

  const rows: Array<{ control: ControlDescriptor; icon: React.ReactNode }> = [
    { control: encoder.clockwise, icon: ROW_ICONS.cw },
    { control: encoder.counterClockwise, icon: ROW_ICONS.ccw },
    { control: encoder.press, icon: ROW_ICONS.press },
    { control: encoder.longPress, icon: ROW_ICONS.long },
  ];

  return (
    <Stack
      direction="row"
      spacing={4}

      sx={{
        alignItems: 'center',
        p: 4,
        borderRadius: `${radius.lg}px`,
        border: '1px solid',
        borderColor: 'device.keycapEdge',
        bgcolor: 'device.keycap',
        minWidth: 0,
        flex: 1,
        // Nothing should ever visually escape the rounded card — a squeezed
        // row's trailing icon (below) used to spill past this corner at
        // narrow widths instead of being clipped or wrapped.
        overflow: 'hidden',
      }}
    >
      <Stack spacing={2} sx={{ alignItems: 'center', flexShrink: 0 }}>
        <Box
          aria-hidden
          sx={(theme) => ({
            position: 'relative',
            width: 76,
            height: 76,
            borderRadius: '50%',
            bgcolor: 'device.keycapAssigned',
            border: '1px solid',
            borderColor: 'device.keycapEdge',
            boxShadow: 'none',
            display: 'grid',
            placeItems: 'center',
            transform: `translateY(${pressed ? 2 : 0}px) rotate(${turningCw ? 14 : turningCcw ? -14 : 0}deg)`,
            transition: theme.transitions.create(['transform', 'background-color'], {
              duration: theme.transitions.duration.shorter,
            }),
            ...((turningCw || turningCcw) && { bgcolor: 'device.keycapLive' }),
          })}
        >
          {/* Indicator notch — shows rotation without relying on colour. */}
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              width: 3,
              height: 14,
              borderRadius: 2,
              bgcolor: turningCw || turningCcw ? 'primary.contrastText' : 'device.legendMuted',
            }}
          />
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '1px dashed',
              borderColor: 'device.legendMuted',
              opacity: 0.5,
            }}
          />
        </Box>
        <Typography variant="caption" sx={{ color: 'device.legend', fontWeight: 620 }}>
          {encoder.label}
        </Typography>
      </Stack>

      <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
        {rows.map(({ control, icon }) => (
          <EncoderRow
            key={control.id}
            control={control}
            icon={icon}
            action={bindings[control.id]}
            selected={selectedControlId === control.id}
            onSelect={onSelect}
          />
        ))}
      </Stack>
    </Stack>
  );
}

function EncoderRow({
  control,
  icon,
  action,
  selected,
  onSelect,
}: {
  control: ControlDescriptor;
  icon: React.ReactNode;
  action: Action | undefined;
  selected: boolean;
  onSelect: (controlId: string) => void;
}) {
  const live = useLiveInputStore((state) => state.active[control.id] !== undefined);
  const label = describeAction(action ?? { type: 'none' });
  const assigned = action !== undefined && action.type !== 'none';

  return (
    <Tooltip
      title={control.note ?? `${control.label} · ${assigned ? label.full : 'No action assigned'}`}
    >
      <ButtonBase
        focusRipple
        onClick={() => onSelect(control.id)}
        aria-label={`${control.label}, ${assigned ? label.full : 'no action assigned'}`}
        aria-pressed={selected}
        sx={(theme) => ({
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '100%',
          // Without this, the row refuses to shrink below its content's
          // natural width once nested this deep in flex containers — the
          // trailing help icon (below) then visually escapes the card's
          // rounded corner at narrow widths instead of the text ellipsizing.
          minWidth: 0,
          overflow: 'hidden',
          px: 2.5,
          py: 1.5,
          borderRadius: `${radius.md}px`,
          textAlign: 'left',
          color: 'device.legend',
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'transparent',
          bgcolor: live ? 'device.keycapLive' : selected ? 'action.selected' : 'transparent',
          transition: theme.transitions.create(['background-color', 'border-color'], {
            duration: theme.transitions.duration.shorter,
          }),
          '&:hover': { bgcolor: live ? 'device.keycapLive' : 'action.hover' },
          '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' },
        })}
      >
        <Box sx={{ display: 'flex', opacity: 0.7, flexShrink: 0 }}>{icon}</Box>

        <Typography
          component="span"
          variant="caption"
          sx={{ width: 44, flexShrink: 0, opacity: 0.7, fontWeight: 600 }}
        >
          {control.shortLabel}
        </Typography>

        <Typography
          component="span"
          variant="caption"
          noWrap
          sx={{ flex: 1, minWidth: 0, fontWeight: 600, opacity: assigned ? 1 : 0.45 }}
        >
          {assigned ? label.primary : 'Unassigned'}
        </Typography>

        {control.confidence !== 'verified' && (
          <HelpOutlineIcon aria-hidden sx={{ fontSize: 14, opacity: 0.6, flexShrink: 0 }} />
        )}
      </ButtonBase>
    </Tooltip>
  );
}
