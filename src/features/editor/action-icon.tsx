'use client';

import type { SvgIconProps } from '@mui/material/SvgIcon';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import KeyboardCommandKeyIcon from '@mui/icons-material/KeyboardCommandKey';
import ShortTextIcon from '@mui/icons-material/ShortText';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlined';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import SwipeVerticalIcon from '@mui/icons-material/SwipeVertical';
import MouseIcon from '@mui/icons-material/Mouse';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import AppsIcon from '@mui/icons-material/Apps';
import RemoveIcon from '@mui/icons-material/Remove';
import type { ActionType } from '@/lib/actions/types';

const ICONS: Record<ActionType, React.ComponentType<SvgIconProps>> = {
  none: RemoveIcon,
  keyboard: KeyboardIcon,
  hotkey: KeyboardCommandKeyIcon,
  text: ShortTextIcon,
  media: PlayCircleOutlineIcon,
  volume: VolumeUpIcon,
  scroll: SwipeVerticalIcon,
  mouse: MouseIcon,
  system: PowerSettingsNewIcon,
  application: AppsIcon,
};

/** One icon per action type, used everywhere an action is listed. */
export function ActionIcon({ type, ...props }: { type: ActionType } & SvgIconProps) {
  const Icon = ICONS[type];
  return <Icon fontSize="small" {...props} />;
}
