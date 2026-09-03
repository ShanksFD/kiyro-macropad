'use client';

import { alpha, createTheme, darken, type Theme } from '@mui/material/styles';
import { duration, easing, palette, radius } from './tokens';

/**
 * Device-visual tokens live inside the palette so MUI generates CSS variables
 * for them and they follow the active colour scheme automatically.
 */
declare module '@mui/material/styles' {
  interface Palette {
    device: DevicePalette;
  }
  interface PaletteOptions {
    device?: DevicePalette;
  }
}

export interface DevicePalette {
  /** The macro pad body. */
  chassis: string;
  chassisEdge: string;
  /** Resting keycap face + its lower bevel. */
  keycap: string;
  keycapEdge: string;
  keycapHover: string;
  /** Keycap that carries a binding. */
  keycapAssigned: string;
  /** Keycap currently selected in the editor. */
  keycapSelected: string;
  /** Keycap lit by a live hardware event. */
  keycapLive: string;
  legend: string;
  legendMuted: string;
  /**
   * Positional accent colours some layouts paint onto specific keycaps —
   * purely a visual grouping (see `key-cap.tsx`'s `keycapAccent`), unrelated
   * to whether the key is bound. `white` needs its own legend colour: the
   * app's usual light-on-dark `legend` text would be nearly invisible on it.
   */
  keycapGreen: string;
  keycapOrange: string;
  keycapWhite: string;
  legendOnWhite: string;
}

const deviceDark: DevicePalette = {
  chassis: '#171C24',
  chassisEdge: '#0A0D11',
  keycap: '#242C37',
  keycapEdge: '#141A22',
  keycapHover: '#2C3542',
  keycapAssigned: '#2A3644',
  keycapSelected: palette.accent.dark,
  keycapLive: palette.accent.main,
  legend: '#E6EAF0',
  legendMuted: '#8B95A3',
  keycapGreen: palette.success.dark,
  keycapOrange: palette.warning.dark,
  keycapWhite: palette.neutral[100],
  legendOnWhite: palette.neutral[900],
};

export const fontStack = 'var(--font-sans), "Segoe UI", system-ui, -apple-system, sans-serif';

export const monoFontFamily =
  'var(--font-mono), "SFMono-Regular", ui-monospace, Consolas, monospace';

export const vars = (t: Theme) => t.vars ?? t;

export const theme = createTheme({
  cssVariables: true,
  colorSchemes: {
    dark: {
      palette: {
        mode: 'dark',
        primary: {
          main: palette.accent.main,
          dark: palette.accent.dark,
          light: palette.accent.light,
          contrastText: '#04121F',
        },
        success: palette.success,
        warning: palette.warning,
        error: palette.error,
        info: palette.info,
        background: { default: palette.neutral[950], paper: palette.neutral[900] },
        text: { primary: '#E9EDF2', secondary: '#98A2B0', disabled: '#5E6875' },
        divider: '#262f3b',
        action: { hover: 'rgba(255, 255, 255, 0.05)', selected: 'rgba(46, 144, 250, 0.16)' },
        device: deviceDark,
      },
    },
  },
  shape: { borderRadius: radius.md },
  spacing: 4,
  transitions: {
    duration: {
      shortest: duration.instant,
      shorter: duration.fast,
      short: duration.base,
      standard: duration.base,
      complex: duration.slow,
    },
    easing: { easeOut: easing.out, easeInOut: easing.easeInOut },
  },
  typography: {
    fontFamily: fontStack,
    h1: { fontSize: '1.75rem', fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1.2 },
    h2: { fontSize: '1.375rem', fontWeight: 640, letterSpacing: '-0.015em', lineHeight: 1.25 },
    h3: { fontSize: '1.0625rem', fontWeight: 620, letterSpacing: '-0.01em', lineHeight: 1.35 },
    h4: { fontSize: '0.9375rem', fontWeight: 620, letterSpacing: '-0.005em' },
    subtitle2: { fontSize: '0.8125rem', fontWeight: 600, letterSpacing: 0 },
    body1: { fontSize: '0.875rem', lineHeight: 1.6 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.55 },
    caption: { fontSize: '0.75rem', lineHeight: 1.45 },
    overline: {
      fontSize: '0.6875rem',
      fontWeight: 600,
      letterSpacing: '0.09em',
      textTransform: 'uppercase',
      lineHeight: 1.6,
    },
    button: { fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: 'antialiased' },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          borderRadius: radius.pill,
          backgroundColor: 'rgba(128, 138, 152, 0.35)',
          border: '3px solid transparent',
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            transitionDuration: '0.01ms !important',
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme: t }) => ({
          backgroundImage: 'none',
          borderRadius: radius.lg,
          '&.MuiPaper-outlined': { borderColor: vars(t).palette.divider },
        }),
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true, disableRipple: true, size: 'small' },
      styleOverrides: {
        root: ({ theme: t }) => ({
          borderRadius: radius.md,
          paddingInline: 14,
          minHeight: 36,
          transition: `background-color ${duration.base}ms ${easing.easeInOut}`,
          '&:hover': {
            backgroundColor: vars(t).palette.primary.dark,
          },
        }),
        sizeSmall: { minHeight: 36, paddingInline: 12 },
        sizeLarge: { minHeight: 42, paddingInline: 20, fontSize: '0.875rem' },
        outlined: ({ theme: t }) => ({
          borderColor: vars(t).palette.divider,
          color: vars(t).palette.text.primary,
          '&:hover': {
            borderColor: vars(t).palette.text.disabled,
            backgroundColor: vars(t).palette.action.hover,
          },
        }),
      },
    },
    MuiButtonGroup: {
      defaultProps: { disableElevation: true, disableRipple: true, size: 'small' },
    },
    MuiIconButton: {
      defaultProps: { size: 'small' },
      styleOverrides: { root: { borderRadius: radius.sm } },
    },
    MuiChip: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: { borderRadius: radius.sm, fontWeight: 550, height: 24 },
        label: { paddingInline: 8 },
        outlined: ({ theme: t }) => ({ borderColor: vars(t).palette.divider }),
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true, enterDelay: 350 },
      styleOverrides: {
        tooltip: { borderRadius: radius.sm, fontSize: '0.75rem', padding: '6px 10px' },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme: t }) => ({ border: `1px solid ${vars(t).palette.divider}` }),
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontSize: '1rem', fontWeight: 620, padding: '20px 20px 8px' } },
    },
    MuiDialogContent: { styleOverrides: { root: { padding: '8px 20px' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: 16, gap: 8 } } },
    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme: t }) => ({
          backgroundImage: 'none',
          borderColor: vars(t).palette.divider,
        }),
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: ({ theme: t }) => ({
          '& .MuiOutlinedInput-root': {
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: vars(t).palette.divider,
            },

            '&:focus-within .MuiOutlinedInput-notchedOutline': {
              border: `2px solid ${vars(t).palette.primary.main}`,
            },
          },
        }),
      },
    },
    MuiSelect: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          borderRadius: radius.md,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: vars(t).palette.divider },
        }),
      },
    },
    MuiSlider: {
      defaultProps: { valueLabelDisplay: 'auto' },
      styleOverrides: {
        root: ({ theme: t }) => ({
          color: vars(t).palette.primary.main,
          height: 5,
          padding: '15px 0',
        }),
        rail: ({ theme: t }) => ({
          opacity: 1,
          backgroundColor: vars(t).palette.divider,
        }),
        track: { border: 'none', height: 5 },
        thumb: ({ theme: t }) => ({
          height: 20,
          width: 20,
          backgroundColor: vars(t).palette.primary.main,
          border: `2px solid ${vars(t).palette.primary.main}`,
          transition: `box-shadow ${duration.fast}ms ${easing.out}`,
          '&::before': { display: 'none' },
          '&:hover, &.Mui-focusVisible': {
            boxShadow: `none`,
          },
          '&.Mui-active': {
            boxShadow: `none`,
          },
        }),
        valueLabel: ({ theme: t }) => ({
          lineHeight: 1.2,
          fontSize: 12,
          fontWeight: 600,
          padding: 0,
          width: 32,
          height: 32,
          borderRadius: '50% 50% 50% 0',
          backgroundColor: vars(t).palette.primary.main,
          color: vars(t).palette.primary.contrastText,
          transformOrigin: 'bottom left',
          transform: 'translate(50%, -100%) rotate(-45deg) scale(0)',
          transition: `transform ${duration.fast}ms ${easing.out}`,
          '&::before': { display: 'none' },
          '&.MuiSlider-valueLabelOpen': {
            transform: 'translate(50%, -100%) rotate(-45deg) scale(1)',
          },
          '& > *': { transform: 'rotate(45deg)' },
        }),
        mark: ({ theme: t }) => ({
          height: 6,
          width: 6,
          borderRadius: '50%',
          backgroundColor: vars(t).palette.divider,
          '&.MuiSlider-markActive': {
            backgroundColor: vars(t).palette.primary.main,
            opacity: 1,
          },
        }),
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 38 },
        indicator: { height: 2, borderRadius: radius.pill },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 38,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.8125rem',
          padding: '6px 12px',
        },
      },
    },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: radius.md, paddingBlock: 7 } } },
    MuiListItemIcon: { styleOverrides: { root: { minWidth: 30 } } },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          fontSize: '0.8125rem',
        },
        outlined: {
          '&.MuiAlert-colorInfo': {
            backgroundColor: darken(palette.info.main, 0.75),
            borderColor: darken(palette.info.main, 0.5),
          },
          '&.MuiAlert-colorSuccess': {
            backgroundColor: darken(palette.success.main, 0.75),
            borderColor: darken(palette.success.main, 0.5),
          },
          '&.MuiAlert-colorWarning': {
            backgroundColor: darken(palette.warning.main, 0.75),
            borderColor: darken(palette.warning.main, 0.5),
          },
          '&.MuiAlert-colorError': {
            backgroundColor: darken(palette.error.main, 0.75),
            borderColor: darken(palette.error.main, 0.5),
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: { root: ({ theme: t }) => ({ borderColor: vars(t).palette.divider }) },
    },
    MuiMenu: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        paper: ({ theme: t }) => ({
          border: `1px solid ${vars(t).palette.divider}`,
          borderRadius: radius.md,
          minWidth: 180,
        }),
      },
    },
    MuiMenuItem: { styleOverrides: { root: { fontSize: '0.8125rem', minHeight: 34 } } },
    MuiSwitch: { defaultProps: { size: 'small' } },
    MuiSnackbar: { defaultProps: { anchorOrigin: { vertical: 'bottom', horizontal: 'right' } } },
  },
});
