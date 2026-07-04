import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173/salamanido/',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173/salamanido/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Enables the build-flag-gated `window.__testHooks__.forceNextExportError` used by
      // tests/e2e/export-error-handling.spec.ts (Testfall 12). Only this Playwright build
      // gets it — the CI job's separate standalone `npm run build` step and the deploy
      // job's build both run without this variable, so production/GitHub Pages bundles
      // never include the hook.
      VITE_ENABLE_TEST_HOOKS: 'true',
    },
  },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile', use: { ...devices['Pixel 7'] } },
    { name: 'Tablet', use: { ...devices['iPad Mini'] } },
  ],
})
