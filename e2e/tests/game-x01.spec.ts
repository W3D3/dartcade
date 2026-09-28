import { test, expect } from '../fixtures/auth.js'

test('X01 manual dart entry shows bust state', async ({ authedPage: page }) => {
  await page.goto('/#/')

  // Select X01 (default mode is ATC)
  await page.click('button:has-text("X01")')

  // Switch start score to 301 (default is 501)
  await page.click('button:has-text("301")')

  await page.click('button:has-text("Game on")')
  await page.waitForURL('**/#/session/**')

  // Entry view auto-activates for boardless sessions
  await expect(page.locator('button[aria-label="Single 1"]')).toBeVisible()

  // Round 1: throw T20 × 3 = 180. Score: 301 − 180 = 121. Takeout.
  // DartEntryPanel multiplier buttons: "Single" | "Double" | "Triple"
  const tripleBtn = page.locator('button:has-text("Triple")').first()
  await tripleBtn.click()
  await page.click('button[aria-label="Triple 20"]')
  await tripleBtn.click()
  await page.click('button[aria-label="Triple 20"]')
  await tripleBtn.click()
  await page.click('button[aria-label="Triple 20"]')

  // End the visit (CorrectionPanel button)
  await page.click('button:has-text("Takeout · next player")')

  // Round 2: T20 → 121−60=61. T20 → 61−60=1. T20 → 1−60=−59 → bust.
  await tripleBtn.click()
  await page.click('button[aria-label="Triple 20"]')
  await tripleBtn.click()
  await page.click('button[aria-label="Triple 20"]')
  await tripleBtn.click()
  await page.click('button[aria-label="Triple 20"]')

  // Bust indicator visible in correction panel or player stats
  await expect(page.locator('text=Bust').first()).toBeVisible()
})
