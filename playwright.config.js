import { defineConfig, devices } from '@playwright/test';

// The suite drives the built app, not the dev server, so it exercises what
// actually ships. The Supabase values are deliberately fake: no test should
// ever reach a real project. They only need to be present, because
// isAiConfigured is derived from them and the AI paths are otherwise dead
// code. Every Supabase request is intercepted per-test.
const PORT = 4173;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never reuse. A server already on the port is serving whatever dist
    // happens to be on disk, which on a machine with real VITE_SUPABASE_*
    // values in its environment is a build pointed at a real project --
    // the stub routes then match nothing and the suite quietly goes
    // online. Rebuilding costs a few seconds; that cost twice in one
    // afternoon. If the port is busy this now fails loudly, which is the
    // correct outcome.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: 'https://stub.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'stub-anon-key-tests-never-reach-a-real-project',
    },
  },
});
