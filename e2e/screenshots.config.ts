import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

// The docs screenshots (npm run screenshots): not part of the e2e suite. Runs against its own
// stack (docker-compose.screenshots.yaml on :5181) and writes PNGs into docs/.
export default defineConfig({
  ...base,
  testDir: './screenshots',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  globalSetup: './screenshots/global-setup.ts',
  globalTeardown: './screenshots/global-teardown.ts',
  use: { ...base.use, baseURL: 'http://localhost:5181', trace: 'off' },
  reporter: 'list',
})
