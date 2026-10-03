import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

test('ATC manual dart entry advances target', async ({ authedPage: page }) => {
  // A solo ATC game with manual entry
  await startGame(page, { mode: 'ATC' })

  // Boardless sessions auto-switch to entry view — DartEntryPanel is visible immediately
  await expect(page.locator('button[aria-label="Single 1"]')).toBeVisible()

  // Initial ATC target is 1
  await expect(page.getByText('Target', { exact: true })).toBeVisible()

  // Throw S1 — hits current target, advances to 2
  await page.click('button[aria-label="Single 1"]')

  // After hitting target 1: "1 of N done" visible in ATC player stats
  await expect(page.locator('text=1 of').first()).toBeVisible()
})
