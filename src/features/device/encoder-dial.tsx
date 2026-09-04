'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  RotateRightIcon,
  RotateLeftIcon,
  TouchAppIcon,
  TimerIcon,
  HelpOutlineIcon,
} from '@/components/icons';
import { describeAction } from '@/lib/actions/format';
import type { Action, BindingMap } from '@/lib/actions/types';
import type { ControlDescriptor, EncoderDescriptor } from '@/lib/devices/types';
import { ActionIcon } from '@/features/editor/action-icon';
import { useLiveInputStore } from '@/stores/live-input-store';
import { duration, easing, radius } from '@/theme/tokens';
import { theme } from '@/theme/theme';
import { lighten, useMediaQuery } from '@mui/material';

// Degrees of visual rotation per detent — aesthetic, not a reading of the
// hardware's actual detent count (see `EncoderNormalizer`'s `pulsesPerStep`).
const DEGREES_PER_STEP = 30;

/**
 * A real spin while turning, not a capped nudge — every detent advances this
 * angle by `DEGREES_PER_STEP` in the turned direction, unbounded, and it
 * springs back to 0 the moment both pulses fade.
 *
 * Deliberately not a `useEffect`/ref — this project's lint rules (a React
 * Compiler-oriented ruleset) forbid reading/writing a ref during render, so
 * this uses React's "adjust state when a prop changes" pattern: comparing
 * against a mirrored previous-value state during render and setting state
 * right there, so it updates in the same render pass a new pulse arrives in.
 */
function useEncoderAngle(cwAt: number | undefined, ccwAt: number | undefined): number {
  const [seen, setSeen] = useState({ cwAt, ccwAt });
  const [angle, setAngle] = useState(0);

  if (seen.cwAt !== cwAt || seen.ccwAt !== ccwAt) {
    setSeen({ cwAt, ccwAt });

    const direction: 'cw' | 'ccw' | null =
      cwAt !== undefined && ccwAt !== undefined
        ? cwAt >= ccwAt
          ? 'cw'
          : 'ccw'
        : cwAt !== undefined
          ? 'cw'
          : ccwAt !== undefined
            ? 'ccw'
            : null;

    if (direction === null) {
      setAngle(0);
    } else {
      setAngle(angle + (direction === 'cw' ? DEGREES_PER_STEP : -DEGREES_PER_STEP));
    }
  }

  return angle;
}

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

/** A rotary encoder: the knob plus its four assignable gestures. */
export function EncoderDial({ encoder, bindings, selectedControlId, onSelect }: Props) {
  const active = useLiveInputStore((state) => state.active);
  const cwAt = active[encoder.clockwise.id];
  const ccwAt = active[encoder.counterClockwise.id];
  const turningCw = cwAt !== undefined;
  const turningCcw = ccwAt !== undefined;
  const pressed = active[encoder.press.id] !== undefined;
  const angleDeg = useEncoderAngle(cwAt, ccwAt);

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
        borderColor: 'divider',
        bgcolor: 'device.keycap',
        minWidth: 0,
        flex: 1,
        // Keeps a squeezed row's trailing icon from spilling past the corner.
        overflow: 'hidden',
      }}
    >
      <Stack spacing={2} sx={{ alignItems: 'center', flexShrink: 0 }}>
        <Box
          sx={{
            position: 'relative',
            width: 104,
            height: 104,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {/* The knob as a light source: an outer bloom plus an inset glow
              on the same ring, both intensifying together while turning. */}
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid',
              borderColor: 'primary.main',
              boxShadow: [
                '0 0 4px var(--mui-palette-primary-main)',
                '0 0 16px 0px color-mix(in srgb, var(--mui-palette-primary-main) 40%, transparent)',
                'inset 0 0 10px var(--mui-palette-primary-main)',
              ].join(', '),
              opacity: 0.7,
              transition: 'opacity 240ms ease, box-shadow 240ms ease',
              ...((turningCw || turningCcw) && {
                opacity: 1,
                boxShadow: [
                  '0 0 16px var(--mui-palette-primary-main)',
                  '0 0 24px 8px color-mix(in srgb, var(--mui-palette-primary-main) 16%, transparent)',
                  'inset 0 0 8px var(--mui-palette-primary-main)',
                ].join(', '),
              }),
            }}
          />

          {/* Outer housing — static; doesn't rotate with the knob. */}
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              width: 76,
              height: 76,
              borderRadius: '50%',
              bgcolor: '#282b34',
              boxShadow: 'inset 0 3px 6px 2px rgba(0, 0, 0, 0.54), 0 1px 1px rgba(63, 69, 86, 1)',
            }}
          />

          <Box
            aria-hidden
            sx={(theme) => ({
              position: 'relative',
              width: 66,
              height: 66,
              borderRadius: '50%',
              background: 'linear-gradient(180deg, #34373f 0%, #1d1f27 100%)',
              boxShadow: [
                'inset 0 1px 3px 4px rgba(0, 0, 0, 0.09)',
                'inset 0 1px 0 1px rgba(255, 255, 255, 0.11)',
                'inset 0 -1px 0 1px rgba(23, 27, 36, 1)',
                '0 8px 6px -2px rgba(0, 0, 0, 0.55)',
              ].join(', '),
              display: 'grid',
              placeItems: 'center',
              transform: `translateY(${pressed ? 2 : 0}px) rotate(${angleDeg}deg)`,
              // Snappy per-detent response, but a slower decelerating
              // spring-back once turning stops (see `useEncoderAngle`).
              transition: theme.transitions.create('transform', {
                duration:
                  turningCw || turningCcw ? theme.transitions.duration.shorter : duration.slow,
                easing: turningCw || turningCcw ? theme.transitions.easing.easeInOut : easing.out,
              }),
            })}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 9,
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor:
                  turningCw || turningCcw
                    ? lighten(theme.palette.primary.light, 0.3)
                    : theme.palette.primary.light,
                boxShadow:
                  turningCw || turningCcw
                    ? [
                        '0 0 8px var(--mui-palette-primary-main)',
                        '0 0 16px 2px color-mix(in srgb, var(--mui-palette-primary-main) 50%, transparent)',
                      ].join(', ')
                    : [
                        '0 0 4px var(--mui-palette-primary-main)',
                        '0 0 8px 2px color-mix(in srgb, var(--mui-palette-primary-main) 30%, transparent)',
                      ].join(', '),
              }}
            />
          </Box>
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
  // A real breakpoint check, not a CSS-hidden element — the icon/text swap
  // below `xl` should mean the other one never enters the DOM at all.
  const isXlUp = useMediaQuery(theme.breakpoints.up('xl'));

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
          // Lets the row shrink below its content's natural width instead of
          // the trailing icon spilling past the card's rounded corner.
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

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Typography
            component="span"
            variant="caption"
            sx={{ flexShrink: 0, opacity: 0.7, fontWeight: 600 }}
          >
            {control.shortLabel}
          </Typography>
          {!isXlUp && (
            <Box sx={{ display: 'flex', opacity: assigned ? 1 : 0.45 }}>
              {!assigned && control.confidence !== 'verified' ? (
                <HelpOutlineIcon aria-hidden sx={{ fontSize: 14 }} />
              ) : (
                <ActionIcon type={action?.type ?? 'none'} sx={{ fontSize: 16 }} />
              )}
            </Box>
          )}

          {isXlUp && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Typography
                component="span"
                variant="caption"
                noWrap
                sx={{ minWidth: 0, fontWeight: 600, opacity: assigned ? 1 : 0.45 }}
              >
                {assigned ? label.primary : 'Unassigned'}
              </Typography>
              {control.confidence !== 'verified' && (
                <HelpOutlineIcon aria-hidden sx={{ fontSize: 14, opacity: 0.6, flexShrink: 0 }} />
              )}
            </Stack>
          )}
        </Box>
      </ButtonBase>
    </Tooltip>
  );
}
