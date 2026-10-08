import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

test('Rematch on the win screen starts the same game again', async ({ authedPage: page }) => {
  // A solo X01 from 301, first to 1 leg, manual entry
  await startGame(page, {
    mode: 'X01',
    setup: async page => {
      const main = page.locator('main')
      await main.getByRole('button', { name: '301', exact: true }).click()
      // The stepper never disables at its floor (it just stays at 1): click down until it reads 1 leg
      const fewer = main.getByRole('button', { name: 'Fewer legs' })
      const legs = fewer.locator('xpath=following-sibling::span[1]')
      const isOne = async () => /^1\s*leg$/.test(((await legs.textContent()) ?? '').trim())
      for (let i = 0; i < 10 && !(await isOne()); i++) await fewer.click()
      await expect(legs).toHaveText(/^\s*1\s*leg\s*$/)
    },
  })
  const firstGame = page.url()

  const treble = page.getByRole('button', { name: 'Treble', exact: true })
  const double = page.getByRole('button', { name: 'Double', exact: true })
  const throwDart = async (multiplier: typeof treble | null, label: string) => {
    if (multiplier) await multiplier.click()
    await page.click(`button[aria-label="${label}"]`)
  }

  // 301 − 180 = 121, then T17 (70), T18 (16), D8: checked out
  for (let i = 0; i < 3; i++) await throwDart(treble, 'Treble 20')
  await page.getByRole('button', { name: 'Next player' }).click()
  await throwDart(treble, 'Treble 17')
  await throwDart(treble, 'Treble 18')
  await throwDart(double, 'Double 8')
  // Manual entry: the checkout visit ends like any other, here with Finish game
  await page.getByRole('button', { name: 'Finish game' }).click()

  const rematch = page.getByRole('button', { name: /Rematch/ })
  await expect(rematch).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to lobby' })).toBeVisible()
  await rematch.click()

  await page.waitForURL(url => url.hash.startsWith('#/session/') && url.toString() !== firstGame)
  await expect(page.locator('button[aria-label="Single 1"]')).toBeVisible()
})
