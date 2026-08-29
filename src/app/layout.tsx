import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { AppProviders } from '@/providers/app-providers';
import { AppShell } from '@/components/layout/app-shell';

const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'Kiyro — Macro Pad Configurator',
    template: '%s · Kiyro',
  },
  description:
    'Connect, configure and save layouts for programmable macro pads directly from your browser.',
  applicationName: 'Kiyro',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F6F8' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0E12' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        {/* Applies the stored colour scheme before first paint. */}
        <InitColorSchemeScript attribute="class" defaultMode="dark" />
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
