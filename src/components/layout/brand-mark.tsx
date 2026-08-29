import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/** Kiyro mark: a keycap silhouette with a rotary notch. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 32 32"
      role="img"
      aria-label="Kiyro"
      sx={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    >
      <rect x="2" y="2" width="28" height="28" rx="8" fill="currentColor" opacity="0.14" />
      <rect
        x="6.5"
        y="6.5"
        width="19"
        height="19"
        rx="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.55"
      />
      <path
        d="M13 10.5v11M13 16.4l5.6-5.9M13 15.6l5.9 6"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Box>
  );
}

export function BrandLockup({ subdued = false }: { subdued?: boolean }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <Box sx={{ color: 'primary.main', display: 'flex' }}>
        <BrandMark />
      </Box>
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
