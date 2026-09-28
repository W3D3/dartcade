import { test, expect } from '../fixtures/auth.js'

test('create manual ATC session lands on game display', async ({ authedPage: page }) => {
  await page.goto('/#/')

  // BoardSelector defaults to "Manual only" when no boards are present in CI
  await expect(page.locator('button[aria-label="Change board"]:has-text("Manual only")')).toBeVisible()

  // Add a second player
  await page.click('button:has-text("Add player")')
  await page.fill('input[placeholder="Guest 2"]', 'Player Two')

  // Submit
  await page.click('button:has-text("Game on")')

  // Redirected to game display
  await page.waitForURL('**/#/session/**')
  await expect(page.locator('text=Player Two')).toBeVisible()
})
