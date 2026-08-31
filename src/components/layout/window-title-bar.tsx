'use client';

import { useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useColorScheme } from '@mui/material/styles';
import { layout } from '@/theme/tokens';
import { useKiyroBridge } from '@/hooks/use-kiyro-bridge';
import { WindowMenu } from './window-menu';

/** `background.paper`/`text.primary` per mode — `src/theme/tokens.ts`'s `palette.neutral`. Kept in sync with `electron/main.ts`'s `DEFAULT_TITLE_BAR_OVERLAY` (dark). */
const TITLE_BAR_OVERLAY_BY_MODE = {
  dark: { color: '#111419', symbolColor: '#EAEDF1' },
  light: { color: '#FFFFFF', symbolColor: '#2A323C' },
} as const;

/**
 * Reserved space for whatever the OS draws over this bar's own corner — the
 * window is frameless (`electron/main.ts`), so nothing else accounts for
 * these. Windows/Linux draw a 3-button caption cluster top-right (~46px
 * each at 100% display scaling, so ~138px — 150px leaves a small margin);
 * macOS's `hiddenInset` traffic lights float top-left in a narrower ~78px.
 */
function chromeInsetFor(platform: 'win32' | 'darwin' | 'linux' | undefined): {
  leadingPx: number;
  trailingPx: number;
} {
  if (platform === 'darwin') return { leadingPx: 78, trailingPx: 0 };
  if (platform === 'win32' || platform === 'linux') return { leadingPx: 0, trailingPx: 150 };
  return { leadingPx: 0, trailingPx: 0 };
}

/**
 * The Electron window's own title bar — replaces the native OS one
 * (`titleBarStyle`, `electron/main.ts`) with Kiyro's own, VSCode-style: a
 * View/Help menu on the left, the OS's real caption buttons/traffic lights
 * left in place on whichever side they belong. No brand mark here — that
 * stays the sidebar's job (`brand-mark.tsx`'s `BrandLockup`), so it isn't
 * shown twice. Spans the full window width, above the sidebar and
 * everything else — `AppShell` renders it outside the sidebar/content split.
 */
export function WindowTitleBar() {
  const kiyro = useKiyroBridge();
  const { mode, systemMode } = useColorScheme();
  const { leadingPx, trailingPx } = chromeInsetFor(kiyro?.platform);
  const resolvedMode = mode === 'system' ? systemMode : mode;

  // Keeps the Windows/Linux caption-button overlay matching this bar's own
  // background — Electron paints it once at window creation and never again
  // on its own, so the theme toggle (including "follow system") would
  // otherwise leave it stuck on whichever mode the window happened to start in.
  useEffect(() => {
    if (!kiyro || resolvedMode === undefined) return;
    void kiyro.window.setTitleBarOverlay(TITLE_BAR_OVERLAY_BY_MODE[resolvedMode === 'light' ? 'light' : 'dark']);
  }, [kiyro, resolvedMode]);

  return (
    <Box
      component="div"
      sx={{
        height: layout.windowTitleBarHeight,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        // Makes the whole bar the window's drag handle (frameless window,
        // `electron/main.ts`) — a no-op outside Electron. `WindowMenu`
        // below opts back out via `no-drag`, or clicks on it would just
        // drag the window instead of opening the menu.
        WebkitAppRegion: 'drag',
      }}
    >
      {/* Reserves room for macOS's traffic lights so real content never sits under them. */}
      {leadingPx > 0 && <Box sx={{ width: leadingPx, flexShrink: 0 }} />}

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pl: 2, pr: 1, WebkitAppRegion: 'no-drag' }}>
        <WindowMenu />
      </Stack>

      <Box sx={{ flex: 1 }} />

      {/* Reserves room for the Windows/Linux caption-button cluster so real content never sits under it. */}
      {trailingPx > 0 && <Box sx={{ width: trailingPx, flexShrink: 0 }} />}
    </Box>
  );
}
