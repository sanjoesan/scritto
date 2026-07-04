/// <reference types="vite/client" />

/**
 * Statically replaced by Vite's `define` (see vite.config.ts) with `true` only when the
 * app is built with `VITE_ENABLE_TEST_HOOKS=true` — set exclusively by
 * playwright.config.ts's `webServer.env` for the Playwright E2E build. It is `false` in
 * every other build, including plain production builds (`npm run build`, GitHub Pages
 * deploy). See `window.__testHooks__` in `src/app/DocumentWorkspace.tsx`.
 */
declare const __ENABLE_TEST_HOOKS__: boolean
