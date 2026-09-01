import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
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

// Dark-only — see `theme/theme.ts`. No `prefers-color-scheme` branching:
// Kiyro never follows the OS scheme, so there's only one value to report.
export const viewport: Viewport = {
  themeColor: '#0B0E12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
