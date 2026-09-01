'use client';

import type { Route } from 'next';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  DevicesOtherIcon,
  TuneIcon,
  LayersIcon,
  SettingsIcon,
  TerminalIcon,
} from '@/components/icons';
import { layout } from '@/theme/tokens';
import { useUiStore } from '@/stores/ui-store';
import { useEditorStore } from '@/stores/editor-store';
import { BrandLockup } from './brand-mark';

interface NavItem {
  href: Route;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/configure' as Route,
    label: 'Configure',
    icon: <TuneIcon fontSize="small" />,
    description: 'Keys and encoders',
  },
  {
    href: '/profiles' as Route,
    label: 'Profiles',
    icon: <LayersIcon fontSize="small" />,
    description: 'Saved layouts',
  },
  {
    href: '/devices' as Route,
    label: 'Devices',
    icon: <DevicesOtherIcon fontSize="small" />,
    description: 'Supported hardware',
  },
  {
    href: '/settings' as Route,
    label: 'Settings',
    icon: <SettingsIcon fontSize="small" />,
    description: 'Preferences',
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const isDirty = useEditorStore((state) => state.isDirty);
  const advanced = useUiStore((state) => state.preferences.advancedMode);
  const debugOpen = useUiStore((state) => state.debugOpen);
  const setDebugOpen = useUiStore((state) => state.setDebugOpen);

  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        width: layout.sidebarWidth,
        flexShrink: 0,
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        position: 'sticky',
        top: layout.windowTitleBarHeight,
        // Was plain `100dvh` — correct only when this was a direct child of
        // the full-viewport row. `AppShell` now nests it below
        // `WindowTitleBar` (the frameless window's own title bar), so its
        // sticky offset and height both need to subtract that bar's height,
        // or it overflows past the bottom of the window. Kept `dvh`-based
        // (not `%`) deliberately — a percentage height here depends on every
        // ancestor in the chain resolving a definite height correctly,
        // whereas `dvh` is viewport-relative and doesn't care.
        height: `calc(100dvh - ${layout.windowTitleBarHeight}px)`,
      }}
    >
      <Box sx={{ px: 5, height: layout.topBarHeight, display: 'flex', alignItems: 'center' }}>
        <NextLink href={'/configure' as Route} style={{ textDecoration: 'none', color: 'inherit' }}>
          <BrandLockup />
        </NextLink>
      </Box>

      <Divider />

      <List sx={{ px: 3, py: 4, flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const selected = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <ListItemButton
              key={item.href}
              component={NextLink}
              href={item.href}
              selected={selected}
              sx={{ mb: 1 }}
            >
              <ListItemIcon sx={{ color: selected ? 'primary.main' : 'text.secondary' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                secondary={item.description}
                slotProps={{
                  primary: { sx: { fontSize: '0.8125rem', fontWeight: selected ? 640 : 550 } },
                  secondary: { sx: { fontSize: '0.6875rem' } },
                }}
              />
              {item.label === 'Configure' && isDirty && (
                <Box
                  aria-hidden
                  sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main' }}
                />
              )}
            </ListItemButton>
          );
        })}
      </List>

      {advanced && (
        <Box sx={{ px: 3, pb: 2 }}>
          <ListItemButton onClick={() => setDebugOpen(!debugOpen)} selected={debugOpen}>
            <ListItemIcon sx={{ color: debugOpen ? 'primary.main' : 'text.secondary' }}>
              <TerminalIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Serial console"
              slotProps={{ primary: { sx: { fontSize: '0.8125rem', fontWeight: 550 } } }}
            />
          </ListItemButton>
        </Box>
      )}

      <Divider />

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', px: 5, py: 3 }}>
        <Chip label="Preview" variant="outlined" size="small" />
        <Typography variant="caption" color="text.secondary">
          v0.1.0
        </Typography>
      </Stack>
    </Box>
  );
}
