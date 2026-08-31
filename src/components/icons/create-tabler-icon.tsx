/**
 * Adapts a Tabler icon component (plain SVG, `size`/`color`/`stroke` props)
 * to behave like an MUI `@mui/icons-material` icon (`fontSize`, `sx`,
 * theme-aware `color` keywords) so migrating call sites is a one-line import
 * swap instead of a rewrite of every usage — see `src/components/icons/index.ts`
 * for the actual per-icon exports.
 *
 * The trick is the same one `SvgIcon` itself uses: render at `1em` square
 * and let CSS `font-size` (not an SVG size attribute) control the visual
 * size, so `sx={{ fontSize: 14 }}` — used freely across this codebase —
 * keeps working unchanged, and so does the `fontSize="small"` shorthand.
 */

import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { Icon as TablerIcon } from '@tabler/icons-react';

export type MuiFontSize = 'inherit' | 'small' | 'medium' | 'large';

/** Matches `SvgIcon`'s own default pixel sizes for each `fontSize` keyword. */
const FONT_SIZE_PX: Record<Exclude<MuiFontSize, 'inherit'>, number> = {
  small: 20,
  medium: 24,
  large: 35,
};

/** The subset of `SvgIcon`'s `color` keyword palette actually used in this app. */
export type MuiIconColor =
  | 'inherit'
  | 'action'
  | 'disabled'
  | 'primary'
  | 'secondary'
  | 'error'
  | 'info'
  | 'success'
  | 'warning';

const COLOR_SX: Record<MuiIconColor, SxProps<Theme>> = {
  inherit: { color: 'currentColor' },
  action: { color: 'action.active' },
  disabled: { color: 'text.disabled' },
  primary: { color: 'primary.main' },
  secondary: { color: 'secondary.main' },
  error: { color: 'error.main' },
  info: { color: 'info.main' },
  success: { color: 'success.main' },
  warning: { color: 'warning.main' },
};

export interface MuiTablerIconProps extends React.SVGAttributes<SVGSVGElement> {
  fontSize?: MuiFontSize;
  color?: MuiIconColor;
  sx?: SxProps<Theme>;
}

export function createTablerIcon(Tabler: TablerIcon) {
  const Wrapped = forwardRef<SVGSVGElement, MuiTablerIconProps>(function WrappedTablerIcon(
    { fontSize = 'medium', color, sx, ...rest },
    ref,
  ) {
    return (
      <Box
        ref={ref}
        component={Tabler}
        // Tabler's own `size` prop sets width/height as raw SVG attributes;
        // Chromium (and therefore Electron) resolves CSS length units like
        // `1em` there, which is what makes the font-size trick below work.
        size="1em"
        stroke={2}
        sx={[
          {
            fontSize: fontSize === 'inherit' ? 'inherit' : FONT_SIZE_PX[fontSize],
            flexShrink: 0,
            userSelect: 'none',
          },
          ...(color ? [COLOR_SX[color]] : []),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        {...rest}
      />
    );
  });
  Wrapped.displayName = `TablerIcon(${Tabler.displayName ?? Tabler.name ?? 'Icon'})`;
  return Wrapped;
}
