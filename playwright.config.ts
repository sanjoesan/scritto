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
    // `permissions` grants clipboard-read/-write explicitly: without it, Chromium's
    // legacy execCommand('cut'/'copy') clipboard path has been observed to silently
    // no-op (selection left completely untouched, no error) under some headless CI
    // configurations, while working fine locally — Chromium-only, hence not applied
    // to the WebKit/Firefox projects below (they don't support this permission and
    // error out if it's requested).
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'], permissions: ['clipboard-read', 'clipboard-write'] } },
    { name: 'Mobile', use: { ...devices['Pixel 7'], permissions: ['clipboard-read', 'clipboard-write'] } },
    { name: 'Tablet', use: { ...devices['iPad Mini'] } },
    {
      // WebKit desktop coverage for the "Kopieren" browser matrix (see
      // specs/kopieren-code.md Entscheidung 2.2) — Desktop, not Touch, so
      // Strg/Cmd+C/V behave like a real desktop Safari user. Scoped to the
      // clipboard spec only, to avoid doubling the runtime of the whole suite
      // (docx/odt/lifecycle/selection-regression/... stay on Chromium+Mobile+Tablet).
      name: 'Desktop Safari (Clipboard)',
      testMatch: /clipboard.*\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      // Firefox coverage for the same reason — not represented by any other
      // project (Mobile/Tablet are both Chromium/WebKit, see kopieren-code.md).
      name: 'Desktop Firefox (Clipboard)',
      testMatch: /clipboard.*\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
  ],
})
