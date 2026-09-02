'use client';

import { useState, type MouseEvent } from 'react';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useKiyroBridge } from '@/hooks/use-kiyro-bridge';
import { radius } from '@/theme/tokens';

/**
 * Replaces the native OS application menu's View/Help entries — the window
 * is frameless (`electron/main.ts`), so there is no native menu bar left to
 * hold them (see `electron/menu.ts`). Each action calls straight into
 * `window.kiyro.window`, backed by the `window:*` IPC handlers registered
 * in `main.ts`.
 */
export function WindowMenu() {
  const kiyro = useKiyroBridge();
  const [openMenu, setOpenMenu] = useState<'view' | 'help' | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  if (!kiyro) return null;

  function open(menu: 'view' | 'help') {
    return (event: MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
      setOpenMenu(menu);
    };
  }

  function close() {
    setAnchorEl(null);
    setOpenMenu(null);
  }

  function run(action: () => Promise<void>) {
    return () => {
      close();
      void action();
    };
  }

  const buttonSx = {
    minWidth: 0,
    px: 2.5,
    py: 0.5,
    height: 'auto',
    minHeight: 'auto',
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: 'text.secondary',
    borderRadius: `${radius.sm}px`,
    '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
  } as const;

  return (
    <>
      <Button disableRipple onClick={open('view')} sx={buttonSx}>
        View
      </Button>
      <Button disableRipple onClick={open('help')} sx={buttonSx}>
        Help
      </Button>

      <Menu anchorEl={anchorEl} open={openMenu === 'view'} onClose={close}>
        <MenuItem onClick={run(kiyro.window.reload)}>Reload</MenuItem>
        <MenuItem onClick={run(kiyro.window.forceReload)}>Force Reload</MenuItem>
        <Divider />
        <MenuItem onClick={run(kiyro.window.toggleDevTools)}>Toggle Developer Tools</MenuItem>
        <Divider />
        <MenuItem onClick={run(kiyro.window.toggleFullscreen)}>Toggle Full Screen</MenuItem>
      </Menu>

      <Menu anchorEl={anchorEl} open={openMenu === 'help'} onClose={close}>
        <MenuItem onClick={run(kiyro.window.showAbout)}>About Kiyro</MenuItem>
      </Menu>
    </>
  );
}
