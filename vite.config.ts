/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/salamanido/',
  plugins: [react(), tailwindcss()],
  define: {
    // Statically replaced at build time — `true` only when the app is built with
    // VITE_ENABLE_TEST_HOOKS=true (set exclusively by playwright.config.ts's
    // `webServer.env` for the Playwright E2E build). `false` for every other build,
    // including the plain `npm run build` used for production/GitHub Pages deploys and
    // for the CI job's standalone build-check step. Gates a small test-only hook (see
    // `window.__testHooks__` in src/app/DocumentWorkspace.tsx) that lets Playwright force
    // a real export failure through an actual browser click (Testfall 12,
    // specs/speichern-exportieren-req.md Abschnitt 6/7) — with the flag `false`, the
    // `if (__ENABLE_TEST_HOOKS__)` branch is dead code that esbuild's minifier strips
    // entirely from the shipped bundle, not merely inert at runtime.
    __ENABLE_TEST_HOOKS__: JSON.stringify(process.env.VITE_ENABLE_TEST_HOOKS === 'true'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
