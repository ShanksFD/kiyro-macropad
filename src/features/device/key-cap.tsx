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
import { monoFontFamily, vars } from '@/theme/theme';
import { ActionIcon } from '@/features/editor/action-icon';

interface Props {
  button: ButtonDescriptor;
  action: Action | undefined;
  selected: boolean;
  showEventCode: boolean;
  onSelect: (controlId: string) => void;
}

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
          borderRadius: 3.5,
          p: 2,
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          textAlign: 'left',
          overflow: 'hidden',
          bgcolor: assigned ? 'device.keycapAssigned' : 'device.keycap',
          color: 'device.legend',
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'device.keycapEdge',
          boxShadow: `0 3px 0 ${vars(theme).palette.device.keycapEdge}, 0 6px 14px rgba(0,0,0,0.28)`,
          transform: 'translateY(0)',
          transition: theme.transitions.create(
            ['transform', 'box-shadow', 'background-color', 'border-color'],
            { duration: theme.transitions.duration.shorter },
          ),
          '&:hover': { bgcolor: 'device.keycapHover' },
          '&:active': { transform: 'translateY(2px)', boxShadow: 'none' },
          '&.Mui-focusVisible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
          ...(selected && {
            boxShadow: `0 0 0 2px ${vars(theme).palette.primary.main}, 0 3px 0 ${vars(theme).palette.device.keycapEdge}, 0 8px 18px rgba(0,0,0,0.30)`,
          }),
          ...(live && {
            bgcolor: 'device.keycapLive',
            color: 'primary.contrastText',
            transform: 'translateY(3px)',
            boxShadow: 'none',
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
                <ActionIcon type={action.type} sx={{ fontSize: 15, opacity: 0.75 }} />
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
                opacity: assigned ? 1 : 0.4,
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
