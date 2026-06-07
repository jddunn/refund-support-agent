import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon. Keep it out of the bundler so the
  // server loads it directly at runtime.
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
