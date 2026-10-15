import { test, expect } from '../fixtures/auth.js'

test('boards open in settings, with the first-board guide for a new account', async ({ authedPage: page }) => {
  await page.goto('/#/boards')
  await expect(page).toHaveURL(/#\/settings\/boards$/)
  await expect(page.locator('main').getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Connect your first board' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pair', exact: true })).toBeVisible()
})
