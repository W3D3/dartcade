import { test, expect } from '../fixtures/auth.js'

test('ATC manual dart entry advances target', async ({ authedPage: page }) => {
  // Start a solo ATC session (manual)
  await page.goto('/#/')
  await expect(page.locator('button[aria-label="Change board"]:has-text("Manual only")')).toBeVisible()
  await page.click('button:has-text("Game on")')
  await page.waitForURL('**/#/session/**')

  // Boardless sessions auto-switch to entry view — DartEntryPanel is visible immediately
  await expect(page.locator('button[aria-label="Single 1"]')).toBeVisible()

  // Initial ATC target is 1
  await expect(page.locator('text=Target')).toBeVisible()

  // Throw S1 — hits current target, advances to 2
  await page.click('button[aria-label="Single 1"]')

  // After hitting target 1: "1 of N done" visible in ATC player stats
  await expect(page.locator('text=1 of')).toBeVisible()
})
