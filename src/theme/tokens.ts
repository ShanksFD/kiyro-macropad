/**
 * Kiyro design tokens.
 *
 * Single source of truth for every raw design value. Nothing in the app should
 * hardcode a colour, radius or duration that exists here — the MUI theme
 * (`src/theme/theme.ts`) consumes these and exposes them as CSS variables.
 */

export const palette = {
  /** Neutral ramp — warm-neutral graphite, tuned for long editing sessions. */
  neutral: {
    0: '#FFFFFF',
    25: '#FAFBFC',
    50: '#F4F6F8',
    100: '#EAEDF1',
    200: '#D8DDE4',
    300: '#BAC2CD',
    400: '#8B95A3',
    500: '#5E6875',
    600: '#414B57',
    700: '#2A323C',
    800: '#1B212A',
    850: '#161B22',
    900: '#111419',
    950: '#0B0E12',
  },
  /** The single product accent. Fill-first; `accentInk` is the text-safe tone. */
  accent: {
    main: '#2E90FA',
    dark: '#1570CD',
    light: '#6BB6FF',
    inkOnLight: '#0F5FB8',
    inkOnDark: '#8CC7FF',
  },
  success: { main: '#12B76A', dark: '#0E9155', light: '#4ED89B' },
  warning: { main: '#F79009', dark: '#C56A06', light: '#FDB44B' },
  error: { main: '#E5484D', dark: '#C13539', light: '#F27377' },
  info: { main: '#5B8DEF', dark: '#3F6FCC', light: '#8FB2F5' },
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const duration = {
  instant: 90,
  fast: 140,
  base: 220,
  slow: 380,
} as const;

export const easing = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
} as const;

/** Fixed chrome dimensions for the application shell. */
export const layout = {
  sidebarWidth: 232,
  sidebarCollapsedWidth: 72,
  topBarHeight: 60,
  inspectorWidth: 400,
  contentMaxWidth: 1680,
} as const;
