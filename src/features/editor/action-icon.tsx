'use client';

import type { MuiTablerIconProps } from '@/components/icons/create-tabler-icon';
import {
  KeyboardIcon,
  KeyboardCommandKeyIcon,
  ShortTextIcon,
  PlayCircleOutlineIcon,
  VolumeUpIcon,
  SwipeVerticalIcon,
  MouseIcon,
  PowerSettingsNewIcon,
  AppsIcon,
  LayersIcon,
  RemoveIcon,
} from '@/components/icons';
import type { ActionType } from '@/lib/actions/types';

const ICONS: Record<ActionType, React.ComponentType<MuiTablerIconProps>> = {
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
  profile: LayersIcon,
};

/** One icon per action type, used everywhere an action is listed. */
export function ActionIcon({ type, ...props }: { type: ActionType } & MuiTablerIconProps) {
  const Icon = ICONS[type];
  return <Icon fontSize="small" {...props} />;
}
