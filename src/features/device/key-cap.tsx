'use client';

import ButtonBase from '@mui/material/ButtonBase';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { HelpOutlineIcon } from '@/components/icons';
import { describeAction } from '@/lib/actions/format';
import type { Action } from '@/lib/actions/types';
import type { ButtonDescriptor } from '@/lib/devices/types';
import { selectIsLive, useLiveInputStore } from '@/stores/live-input-store';
import { monoFontFamily } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { ActionIcon } from '@/features/editor/action-icon';

interface Props {
  button: ButtonDescriptor;
  action: Action | undefined;
  selected: boolean;
  showEventCode: boolean;
  onSelect: (controlId: string) => void;
}

/**
 * Positional colour grouping: the first key of every row is green, the last
 * key of row 1 is orange, and every other key is white. Purely a visual
 * layout choice — unrelated to `confidence`, assignment, or anything
 * hardware-reported — so it lives here rather than on `ButtonDescriptor`
 * itself.
 *
 * Written against `column`/`row` rather than a hardcoded key-id list so it
 * keeps working if `esp32c3-macropad.ts`'s button order or ids ever change;
 * it does assume the last column is column 4 (this device's layout), so a
 * device with a different column count would need its own rule.
 */
type KeycapAccent = 'green' | 'orange' | 'white';

function keycapAccent(button: ButtonDescriptor): KeycapAccent {
  if (button.column === 1) return 'green';
  if (button.column === 4 && button.row === 1) return 'orange';
  return 'white';
}

const ACCENT_BG: Record<KeycapAccent, string> = {
  green: 'device.keycapGreen',
  orange: 'device.keycapOrange',
  white: 'device.keycapWhite',
};

/**
 * A physical key.
 *
 * Depth comes from a hard bottom edge plus a soft ambient shadow; pressing —
 * whether by pointer or by the real hardware — collapses that edge, so the
 * motion reads as travel rather than as a colour change. State is never
 * signalled by colour alone: selection also draws a ring, and a live press also
 * moves the cap.
 */
export function KeyCap({ button, action, selected, showEventCode, onSelect }: Props) {
  const live = useLiveInputStore(selectIsLive(button.id));
  const label = describeAction(action ?? { type: 'none' });
  const assigned = action !== undefined && action.type !== 'none';
  const ambiguous = button.confidence === 'ambiguous';
  const accent = keycapAccent(button);

  const description = assigned ? label.full : 'No action assigned';

  return (
    <Tooltip title={`${button.label} · ${description}`} enterDelay={500}>
      <ButtonBase
        focusRipple
        onClick={() => onSelect(button.id)}
        aria-label={`${button.label}, ${description}${selected ? ', selected' : ''}`}
        aria-pressed={selected}
        sx={(theme) => ({
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: `${radius.lg}px`,
          p: 2,
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          textAlign: 'left',
          overflow: 'hidden',
          boxShadow: 'none',
          // Every key gets a positional accent now, so it always wins over
          // the old assigned/unassigned bg distinction (`keycapAssigned` vs
          // `keycap`). That distinction still reads through the label text
          // ("Unassigned" at reduced opacity) and the action icon, just not
          // through this background any more.
          bgcolor: ACCENT_BG[accent],
          color: accent === 'white' ? 'device.legendOnWhite' : 'device.legend',
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'device.keycapEdge',
          // Flat — no drop shadow. Press/selected/live states read entirely
          // through colour, border, and a small translate on press instead.
          transform: 'translateY(0)',
          transition: theme.transitions.create(['transform', 'background-color', 'border-color'], {
            duration: theme.transitions.duration.shorter,
          }),
          // An accent cap has nowhere lighter/darker to swap to on hover the
          // way the old neutral keycap tone did (`keycapHover` would read as
          // a colour clash against green/orange/white, not a lift) — a
          // brightness filter keeps the same "lit up" read without
          // introducing an unrelated hue.
          '&:hover': { filter: 'brightness(1.08)' },
          '&:active': { transform: 'translateY(1px)' },
          '&.Mui-focusVisible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
          ...(selected && {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: -1,
          }),
          ...(live && {
            bgcolor: 'device.keycapLive',
            color: 'primary.contrastText',
            transform: 'translateY(1px)',
          }),
        })}
      >
        <Stack sx={{ justifyContent: 'space-between', width: '100%', height: '100%' }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography
              component="span"
              sx={{
                fontFamily: monoFontFamily,
                fontSize: '0.6875rem',
                opacity: 0.65,
                lineHeight: 1,
              }}
            >
              {showEventCode && button.eventCode !== null
                ? `BTN:${button.eventCode}`
                : button.shortLabel}
            </Typography>

            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {ambiguous && (
                <Box aria-hidden sx={{ display: 'flex', opacity: 0.7 }}>
                  <HelpOutlineIcon sx={{ fontSize: 14 }} />
                </Box>
              )}
              {assigned && action && (
                <ActionIcon
                  type={action.type}
                  sx={{
                    fontSize: 16,
                    opacity: 0.75,
                  }}
                />
              )}
            </Stack>
          </Stack>

          <Stack spacing={0.5} sx={{ minWidth: 0 }}>
            <Typography
              component="span"
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 620,
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                opacity: assigned ? 1 : 0.6,
              }}
            >
              {assigned ? label.primary : 'Unassigned'}
            </Typography>
            {assigned && label.secondary && (
              <Typography
                component="span"
                sx={{ fontSize: '0.6875rem', opacity: 0.6, lineHeight: 1.2 }}
                noWrap
              >
                {label.secondary}
              </Typography>
            )}
          </Stack>
        </Stack>
      </ButtonBase>
    </Tooltip>
  );
}
