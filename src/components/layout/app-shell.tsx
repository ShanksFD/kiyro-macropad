'use client';

import { useEffect, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import { layout } from '@/theme/tokens';
import { DebugConsole } from '@/features/debug/debug-console';
import { useUiStore } from '@/stores/ui-store';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { WindowTitleBar } from './window-title-bar';
import { MobileNav } from './mobile-nav';

/** Persistent chrome: the window's own title bar, navigation, device status, and the developer console. */
export function AppShell({ children }: { children: ReactNode }) {
  const density = useUiStore((state) => state.preferences.density);

  // Density scales the root font size; every dimension in the theme is relative
  // to it, so one value tightens the whole interface consistently.
  useEffect(() => {
    document.documentElement.style.fontSize = density === 'compact' ? '15px' : '';
  }, [density]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', bgcolor: 'background.default' }}>
      {/* Spans the full width, above the sidebar too — matches VSCode's own
          title bar, which isn't scoped to just the editor pane. */}
      <WindowTitleBar />

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar />

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <TopBar />
          <MobileNav />

          <Box
            component="main"
            sx={{
              flex: 1,
              minWidth: 0,
              px: { xs: 4, lg: 6, xl: 8 },
              py: { xs: 5, lg: 7 },
              width: '100%',
              maxWidth: layout.contentMaxWidth,
              mx: 'auto',
            }}
          >
            {children}
          </Box>
        </Box>

        <DebugConsole />
      </Box>
    </Box>
  );
}
