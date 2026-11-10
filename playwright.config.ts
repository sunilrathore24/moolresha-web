/**
 * Playwright configuration for the end-to-end, accessibility and layout specs in tests/e2e/.
 *
 * - baseURL comes from E2E_BASE_URL (default http://localhost:4321, the Astro dev server).
 *   For the CI run against the built site, build first and serve dist/ (for example
 *   `npx astro preview --port 4321`) and set E2E_BASE_URL.
 * - No webServer is started here: start the dev or preview server yourself.
 * - No network: every spec stubs /api/* and the Turnstile script with page.route and aborts any
 *   other off-origin request (tests/e2e/fixtures.ts).
 * - Browsers are NOT downloaded by this config. By default Playwright uses its own Chromium
 *   (`npx playwright install chromium`, run by the developer). To use an already installed Google
 *   Chrome or Edge instead, set E2E_CHANNEL=chrome (or msedge).
 * - vitest does not pick these files up: vitest.config.ts excludes tests/e2e/** and only includes
 *   *.test.ts, while Playwright only runs *.spec.ts.
 */
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4321';
const channel = process.env.E2E_CHANNEL || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 7_500 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL,
    channel,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel },
    },
  ],
});
