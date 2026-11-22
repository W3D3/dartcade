import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

test('Catch 40: a 2-dart checkout of 61 scores 3 points and moves to 62', async ({ adminPage: page }) => {
  // Catch 40 is behind gamemode.catch40.enabled, admins only: adminPage
  await startGame(page, { mode: 'Catch 40' })

  // Boardless sessions auto-activate manual entry (DartKeypad)
  await expect(page.locator('button[aria-label="Single 1"]')).toBeVisible()

  const throwDart = async (m: 'Treble' | 'Double', n: number) => {
    await page.getByRole('button', { name: m, exact: true }).click()
    await page.click(`button[aria-label="${m} ${n}"]`)
  }

  // 61 - T19 (57) - D2 (4) = 0
  await throwDart('Treble', 19)
  await throwDart('Double', 2)

  await expect(page.getByText('3 pts', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next: 62' }).click()
  await expect(page.locator('section[aria-label^="Target 62,"]')).toBeVisible()
})
