import { defineConfig } from '@playwright/test'
import { existsSync } from 'fs'

// On NixOS, system libs aren't at standard paths so the downloaded Chromium won't
// link. Use the system-installed Chrome when available; fall back to the env var
// override; otherwise let Playwright use its downloaded browser (works on CI).
function resolveExecutablePath(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/run/current-system/sw/bin/google-chrome',
    '/run/current-system/sw/bin/chromium',
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  return undefined
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    launchOptions: {
      executablePath: resolveExecutablePath(),
    },
  },
  reporter: process.env.CI ? 'github' : 'list',
})
