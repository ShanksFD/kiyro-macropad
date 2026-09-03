import type { NextConfig } from 'next';
import { version } from './package.json';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  output: 'export',
  devIndicators: false,
  // Exposes only the version string to client code, as
  // `process.env.NEXT_PUBLIC_APP_VERSION` (see `sidebar.tsx`) — resolved and
  // inlined once at build time, same as any other `NEXT_PUBLIC_*` variable.
  // Reading `package.json` directly here (this file runs in Node, at config
  // time, never shipped) rather than importing it from a client component:
  // a JSON import bundles the *entire* file — name, every dependency,
  // scripts — into client JS as one object literal, since bundlers don't
  // tree-shake individual properties out of it. This keeps only the one
  // string anyone actually needs in the shipped bundle.
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default nextConfig;
