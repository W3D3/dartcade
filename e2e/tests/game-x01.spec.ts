import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

test('X01 manual dart entry shows bust state', async ({ authedPage: page }) => {
  // A solo X01 game from 301, manual entry
  await startGame(page, { mode: 'X01', setup: page => page.locator('main').getByRole('button', { name: '301', exact: true }).click() })

  // Entry view auto-activates for boardless sessions
  await expect(page.locator('button[aria-label="Single 1"]')).toBeVisible()

  // Round 1: throw T20 × 3 = 180. Score: 301 − 180 = 121. Takeout.
  // Keypad multipliers: "Single" | "Double" | "Treble"; it goes back to Single after each dart
  const tripleBtn = page.getByRole('button', { name: 'Treble', exact: true })
  await tripleBtn.click()
  await page.click('button[aria-label="Treble 20"]')
  await tripleBtn.click()
  await page.click('button[aria-label="Treble 20"]')
  await tripleBtn.click()
  await page.click('button[aria-label="Treble 20"]')

  // End the visit
  await page.getByRole('button', { name: 'Next player' }).click()

  // Round 2: T20 → 121−60=61. T20 → 61−60=1: with double out a 1 can't be finished, so it's a
  // bust and the visit ends (the third dart is disabled).
  await tripleBtn.click()
  await page.click('button[aria-label="Treble 20"]')
  await tripleBtn.click()
  await page.click('button[aria-label="Treble 20"]')

  // Bust indicator visible in correction panel or player stats
  await expect(page.locator('text=Bust').first()).toBeVisible()
})
