/**
 * Central icon set — replaces `@mui/icons-material`, migrated to
 * `@tabler/icons-react` (see `create-tabler-icon.tsx` for how each icon
 * keeps accepting MUI-style `fontSize`/`sx`/`color` props).
 *
 * Every export here is named exactly as it was imported at each call site
 * pre-migration (including a few inconsistencies inherited from MUI, e.g.
 * `HelpOutlineIcon` for the `HelpOutlined` icon) — the goal was a one-line
 * import-source swap at each usage, not a rename.
 */

import {
  IconAdjustments,
  IconAlertCircle,
  IconActivity,
  IconApps,
  IconArrowBackUp,
  IconArrowRight,
  IconArrowsVertical,
  IconBan,
  IconCaretDownFilled,
  IconCheck,
  IconCircleCheck,
  IconClipboard,
  IconClock,
  IconCommand,
  IconCopy,
  IconDeviceFloppy,
  IconDevices,
  IconDotsVertical,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconFlask,
  IconHandClick,
  IconHelpCircle,
  IconKeyboard,
  IconMinus,
  IconMouse,
  IconNotes,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlugConnected,
  IconPlugOff,
  IconPlus,
  IconPointFilled,
  IconPower,
  IconRefresh,
  IconReload,
  IconRotate2,
  IconRotateClockwise2,
  IconSettings,
  IconStack2,
  IconStar,
  IconStarFilled,
  IconTerminal2,
  IconTextSize,
  IconTrash,
  IconTrashX,
  IconUnlink,
  IconUpload,
  IconUsb,
  IconVolume,
  IconX,
} from '@tabler/icons-react';
import { createTablerIcon } from './create-tabler-icon';

export const AddIcon = createTablerIcon(IconPlus);
export const AppsIcon = createTablerIcon(IconApps);
export const ArrowDropDownIcon = createTablerIcon(IconCaretDownFilled);
export const ArrowForwardIcon = createTablerIcon(IconArrowRight);
export const BlockIcon = createTablerIcon(IconBan);
export const CableIcon = createTablerIcon(IconPlugConnected);
export const CheckIcon = createTablerIcon(IconCheck);
export const CheckCircleOutlineIcon = createTablerIcon(IconCircleCheck);
export const ClearIcon = createTablerIcon(IconX);
export const CloseIcon = createTablerIcon(IconX);
export const ContentCopyIcon = createTablerIcon(IconCopy);
export const ContentPasteIcon = createTablerIcon(IconClipboard);
export const DeleteOutlineIcon = createTablerIcon(IconTrash);
export const DeleteSweepIcon = createTablerIcon(IconTrashX);
export const DevicesOtherIcon = createTablerIcon(IconDevices);
export const DownloadIcon = createTablerIcon(IconDownload);
export const DriveFileRenameOutlineIcon = createTablerIcon(IconEdit);
export const EditNoteIcon = createTablerIcon(IconNotes);
export const ErrorOutlineIcon = createTablerIcon(IconAlertCircle);
export const ExpandMoreIcon = createTablerIcon(IconCaretDownFilled);
export const FiberManualRecordIcon = createTablerIcon(IconPointFilled);
export const HelpOutlineIcon = createTablerIcon(IconHelpCircle);
export const KeyboardIcon = createTablerIcon(IconKeyboard);
export const KeyboardCommandKeyIcon = createTablerIcon(IconCommand);
export const LayersIcon = createTablerIcon(IconStack2);
export const LinkOffIcon = createTablerIcon(IconUnlink);
export const MoreVertIcon = createTablerIcon(IconDotsVertical);
export const MouseIcon = createTablerIcon(IconMouse);
export const NetworkPingIcon = createTablerIcon(IconActivity);
export const OpenInNewIcon = createTablerIcon(IconExternalLink);
export const PauseIcon = createTablerIcon(IconPlayerPause);
export const PlayArrowIcon = createTablerIcon(IconPlayerPlay);
export const PlayCircleOutlineIcon = createTablerIcon(IconPlayerPlay);
export const PowerSettingsNewIcon = createTablerIcon(IconPower);
export const RefreshIcon = createTablerIcon(IconRefresh);
export const RemoveIcon = createTablerIcon(IconMinus);
export const RestartAltIcon = createTablerIcon(IconReload);
export const RotateLeftIcon = createTablerIcon(IconRotate2);
export const RotateRightIcon = createTablerIcon(IconRotateClockwise2);
export const SaveIcon = createTablerIcon(IconDeviceFloppy);
export const ScienceIcon = createTablerIcon(IconFlask);
export const SettingsIcon = createTablerIcon(IconSettings);
export const ShortTextIcon = createTablerIcon(IconTextSize);
export const StarIcon = createTablerIcon(IconStarFilled);
export const StarBorderIcon = createTablerIcon(IconStar);
export const SwipeVerticalIcon = createTablerIcon(IconArrowsVertical);
export const TerminalIcon = createTablerIcon(IconTerminal2);
export const TimerIcon = createTablerIcon(IconClock);
export const TouchAppIcon = createTablerIcon(IconHandClick);
export const TuneIcon = createTablerIcon(IconAdjustments);
export const UndoIcon = createTablerIcon(IconArrowBackUp);
export const UploadIcon = createTablerIcon(IconUpload);
export const UsbIcon = createTablerIcon(IconUsb);
export const UsbOffIcon = createTablerIcon(IconPlugOff);
export const VolumeUpIcon = createTablerIcon(IconVolume);
