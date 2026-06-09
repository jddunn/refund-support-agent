import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end test floor. Drives the real Next app in a headless browser to
 * cover the consumer chat surface, the admin auth gate, and the admin pages.
 *
 * Zero-config invariant: the suite needs NO model key. The app boots and
 * self-seeds its SQLite store on first run; the one flow that would call the
 * model (`POST /api/chat`) is route-mocked in the consumer spec, so the whole
 * floor is deterministic and runs in CI without secrets. The admin password
 * and session secret below are throwaway test values, not real credentials.
 */
const PORT = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Serial + single worker: the app self-seeds its SQLite store on the first db
  // request, so parallel workers hitting a cold server race on the seed. The
  // floor is small; determinism beats parallelism here.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Production build + start: representative of the deployed app and free of
    // dev-mode HMR/compile races that flake e2e. Reuses an already-running
    // server locally; always boots its own in CI.
    // `output: 'standalone'` does NOT bundle the client assets — they must be
    // copied into the standalone tree or nothing hydrates (SSR renders but the
    // page is dead). Mirror what the Dockerfile does at deploy time.
    command:
      'npm run build && rm -rf .next/standalone/.next/static .next/standalone/public && mkdir -p .next/standalone/.next && cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public && node .next/standalone/server.js',
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: String(PORT),
      ADMIN_PASSWORD: 'admin',
      SESSION_SECRET: 'e2e-test-session-secret-not-a-real-secret',
    },
  },
});
