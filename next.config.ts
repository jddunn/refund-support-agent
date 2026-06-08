import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon. Keep it out of the bundler so the
  // server loads it directly at runtime.
  serverExternalPackages: ['better-sqlite3'],
  // Bundle the data fixtures and schema that server code reads at runtime, so
  // they exist inside the serverless functions on platforms like Vercel.
  outputFileTracingIncludes: {
    '/api/chat': ['./seed/**', './src/db/schema.sql'],
    '/api/runs': ['./seed/**', './src/db/schema.sql'],
    '/api/runs/[id]': ['./seed/**', './src/db/schema.sql'],
    '/api/adversarial': ['./tests/adversarial/cases.json'],
    '/admin/policy': ['./seed/refund-policy.md'],
    '/chat': ['./seed/**', './src/db/schema.sql'],
  },
};

export default nextConfig;
