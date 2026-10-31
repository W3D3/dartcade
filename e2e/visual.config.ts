import { defineConfig } from '@playwright/test'

// The visual regression check (scripts/visual.sh): every game mode's match screen compared with the
// images in visual/__screenshots__. Not part of `npm test`: it runs inside the pinned Playwright image
// against the e2e stack (started by the script), so CI and every developer render the same pixels.
export default defineConfig({
  testDir: './visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${process.env.E2E_FRONTEND_PORT ?? 5174}`,
    locale: 'en-GB',
    timezoneId: 'Europe/Vienna',
    deviceScaleFactor: 1,
    trace: 'off',
  },
  expect: {
    // Room for a few pixels of anti-aliasing flicker on rounded corners (seen: 7); a changed word is ~200
    toHaveScreenshot: { maxDiffPixels: 20, animations: 'disabled', caret: 'hide' },
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'visual-report' }], ['json', { outputFile: 'visual-results.json' }]],
})
