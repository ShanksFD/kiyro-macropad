'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { layout } from '@/theme/tokens';
import { useKiyroBridge } from '@/hooks/use-kiyro-bridge';
import { WindowMenu } from './window-menu';

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
  const { leadingPx, trailingPx } = chromeInsetFor(kiyro?.platform);

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
        WebkitAppRegion: 'drag',
      }}
    >
      {/* Reserves room for macOS's traffic lights so real content never sits under them. */}
      {leadingPx > 0 && <Box sx={{ width: leadingPx, flexShrink: 0 }} />}

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', pl: 2, pr: 1, WebkitAppRegion: 'no-drag' }}
      >
        <WindowMenu />
      </Stack>

      <Box sx={{ flex: 1 }} />

      {/* Reserves room for the Windows/Linux caption-button cluster so real content never sits under it. */}
      {trailingPx > 0 && <Box sx={{ width: trailingPx, flexShrink: 0 }} />}
    </Box>
  );
}
