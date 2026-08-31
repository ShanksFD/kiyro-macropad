'use client';

import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { DarkModeOutlinedIcon, LightModeOutlinedIcon } from '@/components/icons';
import { useColorScheme } from '@mui/material/styles';

export function ThemeToggle() {
  // `mode` is undefined until the scheme is resolved on the client, which is
  // exactly the point at which it is safe to render the matching icon.
  const { mode, setMode } = useColorScheme();
  const isDark = mode === 'dark' || mode === undefined;
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <Tooltip title={label}>
      <IconButton aria-label={label} onClick={() => setMode(isDark ? 'light' : 'dark')}>
        {mode === 'light' ? (
          <LightModeOutlinedIcon fontSize="small" />
        ) : (
          <DarkModeOutlinedIcon fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  );
}
