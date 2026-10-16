import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

test('121: a solo session played to the end with manual darts ends on the summary', async ({ adminPage: page }) => {
  // 121 is behind gamemode.p121.enabled, admins only: adminPage (ADMIN_EMAILS in docker-compose.e2e.yaml)
  await startGame(page, {
    mode: '121',
    setup: async page => {
      await page.locator('main').getByRole('button', { name: '5', exact: true }).click()
    },
  })

  // Boardless sessions auto-activate manual entry (DartKeypad)
  await expect(page.locator('button[aria-label="Single 1"]')).toBeVisible()

  const mult = (name: 'Treble' | 'Double') => page.getByRole('button', { name, exact: true })
  const throwDart = async (m: 'Treble' | 'Double', n: number) => {
    await mult(m).click()
    await page.click(`button[aria-label="${m} ${n}"]`)
  }

  // Try 1: T20, T11, D14 — 121 - 60 - 33 - 28 = 0, a double-out checkout in 3 darts
  await throwDart('Treble', 20)
  await throwDart('Treble', 11)
  await throwDart('Double', 14)

  // The made card shows "Checked out", and the next try's target is one higher
  await expect(page.getByText('Checked out', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next: 122' }).click()
  await expect(page.locator('section[aria-label^="Target 122,"]')).toBeVisible()

  // Tries 2–5: give up each one through the confirm modal
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /Give up this try/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Give up' }).click()
  }

  // All 5 tries are used: the game ends and the summary shows
  await expect(page.getByText('Session complete · 5 tries')).toBeVisible()
  const checkoutsTile = page.locator('text=Checkouts').locator('xpath=..')
  await expect(checkoutsTile).toContainText('1/5')
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible()
})
