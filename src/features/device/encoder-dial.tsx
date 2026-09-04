'use client';

import { useState } from 'react';
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
import { duration, easing, radius } from '@/theme/tokens';

/**
 * Degrees of visual rotation per detent. An aesthetic choice, not a reading
 * of the hardware's actual detent count (which is not established — see
 * `EncoderNormalizer`'s own doc comment on `pulsesPerStep`): 30° reads as a
 * deliberate, felt step at one detent and as a smooth spin once several land
 * close together, without the knob completing a lap in an unrealistically
 * small number of clicks.
 */
const DEGREES_PER_STEP = 30;

/**
 * A real spin while turning, not a capped nudge — every detent advances this
 * angle by `DEGREES_PER_STEP` in the turned direction, so a fast run of
 * pulses reads as an actual multi-step rotation rather than one small flick.
 * `rotate()` places no meaningful limit on the value, and the `transition` on
 * `transform` (`EncoderDial`, below) is what turns a run of discrete jumps
 * into a smooth spin when pulses land close together rather than a series of
 * visible snaps.
 *
 * It springs back to 0 as soon as pulses stop (see the `direction === null`
 * branch below) rather than staying at rest wherever it landed — the same
 * transition that makes the spin itself smooth also makes the return read as
 * a deliberate snap-back, not a jump cut.
 *
 * `cwAt`/`ccwAt` are the raw pulse timestamps from `live-input-store`'s
 * `active` map (not just a boolean): every new pulse — even a same-direction
 * one arriving while the previous pulse's highlight is still active —
 * overwrites that timestamp, which is what lets this tell individual detents
 * apart instead of seeing one contiguous "is turning" span.
 *
 * Deliberately not a `useEffect`, and deliberately not a ref either — this
 * project's lint rules (a React Compiler-oriented ruleset) forbid reading or
 * writing a ref during render, so "the last pulse seen" has to be ordinary
 * state like everything else here. This is React's own "adjust state when a
 * prop changes" pattern: comparing against a mirrored previous-value state
 * during render and calling `setState` right there rather than after a
 * commit, so it updates in the same render pass a new pulse arrives in,
 * instead of one tick behind an effect.
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
      // Both pulses have faded — spring back to the first position.
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

/**
 * A rotary encoder: the knob plus its four assignable gestures.
 *
 * The knob spins in the direction the hardware actually turned — a genuine,
 * unbounded rotation rather than a snap-back nudge, see `useEncoderAngle`
 * above — so a physical twist is confirmed visually without reading any text.
 */
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
        <Box sx={{ position: 'relative', width: 104, height: 104, display: 'grid', placeItems: 'center' }}>
          {/* The knob as a genuine light source, not just a bordered circle:
              an outer bloom plus an inset glow on the same ring, both sides
              of it lighting up together — turning intensifies both rather
              than swapping in a different effect. */}
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid',
              borderColor: 'primary.main',
              // `color-mix` (not a `-Channel` CSS var) makes the translucent
              // bloom layer, since it works directly on the `var()` colour
              // reference without depending on MUI's channel-variable naming.
              boxShadow: [
                '0 0 10px var(--mui-palette-primary-main)',
                '0 0 26px 4px color-mix(in srgb, var(--mui-palette-primary-main) 40%, transparent)',
                'inset 0 0 10px var(--mui-palette-primary-main)',
              ].join(', '),
              opacity: 0.6,
              transition: 'opacity 240ms ease, box-shadow 240ms ease',
              ...((turningCw || turningCcw) && {
                opacity: 1,
                boxShadow: [
                  '0 0 14px var(--mui-palette-primary-main)',
                  '0 0 36px 8px color-mix(in srgb, var(--mui-palette-primary-main) 55%, transparent)',
                  'inset 0 0 14px var(--mui-palette-primary-main)',
                ].join(', '),
              }),
            }}
          />

          <Box
            aria-hidden
            sx={(theme) => ({
              position: 'relative',
              width: 76,
              height: 76,
              borderRadius: '50%',
              // Flat fill — the roundness reads entirely through the
              // box-shadow layering below, same as the mockup. Picked by
              // eye there against this app's actual dark background, so
              // it's a literal value rather than an existing `device.*`
              // token (none of those landed at the same shade).
              background: '#262d37',
              boxShadow: [
                // soft light bouncing in from above the sphere, not on it
                '0 -14px 18px -6px rgba(140, 150, 165, 0.5)',
                // the sphere's own weight, cast down and out
                '0 16px 28px -4px rgba(0, 0, 0, 0.6)',
                // inner rim catching that same overhead light
                'inset 0 5px 6px rgba(255, 255, 255, 0.25)',
                // inner underside falling into shadow
                'inset 0 -5px 8px rgba(0, 0, 0, 0.35)',
              ].join(', '),
              display: 'grid',
              placeItems: 'center',
              transform: `translateY(${pressed ? 2 : 0}px) rotate(${angleDeg}deg)`,
              // Two different feels on purpose: each detent should read as an
              // immediate, snappy response (short duration, so a fast run of
              // them still blends into a smooth spin — see `useEncoderAngle`),
              // but the spring-back once turning stops is a much bigger jump in
              // one go (as much as 330°) and needs real time and a decelerating
              // ease to read as an animated return rather than a teleport. At
              // the old single 140ms duration it was technically animating but
              // too fast to perceive as anything but a snap.
              transition: theme.transitions.create('transform', {
                duration: turningCw || turningCcw ? theme.transitions.duration.shorter : duration.slow,
                easing: turningCw || turningCcw ? theme.transitions.easing.easeInOut : easing.out,
              }),
            })}
          >
            {/* Indicator dot — white with the ring's own blue glow, rather
                than a neutral bar, so it reads as part of the same light
                source as the ring instead of an unrelated marking. */}
            <Box
              sx={{
                position: 'absolute',
                top: 9,
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: '#fbfdff',
                boxShadow: '0 0 10px var(--mui-palette-primary-main)',
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
