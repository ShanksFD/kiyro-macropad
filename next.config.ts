import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Static export for Electron packaging (loaded via file:// when
  // `app.isPackaged`). Dev mode still loads the live `next dev` server, so
  // this has no effect on `npm run electron:dev`.
  output: 'export',
};

export default nextConfig;
