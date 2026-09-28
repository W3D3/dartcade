import { test, expect } from '../fixtures/auth.js'

test('boards page renders heading and action button', async ({ authedPage: page }) => {
  await page.goto('/#/boards')
  await expect(page.locator('h1:has-text("Boards")')).toBeVisible()
  // "Pair new board" primary button always present
  await expect(page.locator('button:has-text("Pair new board")')).toBeVisible()
})
