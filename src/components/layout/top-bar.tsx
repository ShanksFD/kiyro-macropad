'use client';

import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { TerminalIcon } from '@/components/icons';
import { layout } from '@/theme/tokens';
import { ConnectionBadge } from '@/features/connection/connection-badge';
import { ConnectButton } from '@/features/connection/connect-button';
import { ProfileSelector } from '@/features/profiles/profile-selector';
import { SaveControls } from '@/features/editor/save-controls';
import { useUiStore } from '@/stores/ui-store';
import { ThemeToggle } from './theme-toggle';

export function TopBar() {
  const pathname = usePathname();
  const advanced = useUiStore((state) => state.preferences.advancedMode);
  const debugOpen = useUiStore((state) => state.debugOpen);
  const setDebugOpen = useUiStore((state) => state.setDebugOpen);

  const onConfigure = pathname.startsWith('/configure');

  return (
    <Box
      component="header"
      sx={{
        height: layout.topBarHeight,
        flexShrink: 0,
        px: { xs: 4, lg: 6 },
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        position: 'sticky',
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar,
      }}
    >
      <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
        <ConnectionBadge />
      </Stack>

      <Box sx={{ flex: 1 }} />

      <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
        {onConfigure && (
          <>
            <Box sx={{ display: { xs: 'none', lg: 'block' } }}>
              <ProfileSelector />
            </Box>
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <SaveControls compact />
            </Box>
            <Divider orientation="vertical" flexItem sx={{ my: 3 }} />
          </>
        )}

        <ConnectButton />

        {advanced && (
          <Tooltip title="Serial console">
            <IconButton
              aria-label="Toggle serial console"
              onClick={() => setDebugOpen(!debugOpen)}
              color={debugOpen ? 'primary' : 'default'}
            >
              <TerminalIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <ThemeToggle />
      </Stack>
    </Box>
  );
}
