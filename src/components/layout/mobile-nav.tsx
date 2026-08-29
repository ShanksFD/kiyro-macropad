'use client';

import type { Route } from 'next';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';

const ITEMS: Array<{ href: Route; label: string }> = [
  { href: '/' as Route, label: 'Overview' },
  { href: '/configure' as Route, label: 'Configure' },
  { href: '/profiles' as Route, label: 'Profiles' },
  { href: '/devices' as Route, label: 'Devices' },
  { href: '/settings' as Route, label: 'Settings' },
];

/**
 * Narrow-viewport navigation.
 *
 * Deliberately a different structure from the desktop sidebar rather than a
 * shrunken copy of it.
 */
export function MobileNav() {
  const pathname = usePathname();
  const current = ITEMS.find((item) => item.href === pathname)?.href ?? ITEMS[0]!.href;

  return (
    <Box
      sx={{
        display: { xs: 'block', md: 'none' },
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        px: 2,
      }}
    >
      <Tabs value={current} variant="scrollable" scrollButtons={false} aria-label="Sections">
        {ITEMS.map((item) => (
          <Tab
            key={item.href}
            value={item.href}
            label={item.label}
            component={NextLink}
            href={item.href}
          />
        ))}
      </Tabs>
    </Box>
  );
}
