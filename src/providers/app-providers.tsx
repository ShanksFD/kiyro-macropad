'use client';

import type { ReactNode } from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '@/theme/theme';
import { useAppBootstrap } from '@/hooks/use-app-bootstrap';
import { ToastHost } from '@/components/layout/toast-host';

function Bootstrap({ children }: { children: ReactNode }) {
  useAppBootstrap();
  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={theme} defaultMode="dark">
        <CssBaseline />
        <Bootstrap>{children}</Bootstrap>
        <ToastHost />
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
