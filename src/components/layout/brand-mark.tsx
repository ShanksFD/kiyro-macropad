import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * The real Kiyro app icon (`electron/assets/icon.ico`, copied to
 * `public/brand/kiyro-mark.ico` at build time — see that folder's
 * `.ico`/`.icns` for the packaged-app versions). Chromium decodes `.ico`
 * directly in an `<img>`, and picks whichever embedded resolution suits the
 * rendered size, the same way a favicon does.
 */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <Box
      component="img"
      src="/brand/kiyro-mark.ico"
      alt="Kiyro"
      sx={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    />
  );
}

export function BrandLockup({ subdued = false }: { subdued?: boolean }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <BrandMark />
      <Stack spacing={0} sx={{ lineHeight: 1 }}>
        <Typography
          component="span"
          sx={{ fontSize: '0.9375rem', fontWeight: 680, letterSpacing: '-0.02em' }}
        >
          Kiyro
        </Typography>
        {!subdued && (
          <Typography component="span" variant="caption" color="text.secondary">
            Macro pad configurator
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}
