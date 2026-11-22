import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

test('shanghai: a single, double and treble of the round number wins at once', async ({ adminPage: page }, testInfo) => {
  // Shanghai is behind gamemode.shanghai.enabled, admins only: adminPage (made an admin by the auth fixture)
  await startGame(page, { mode: 'Shanghai', guests: ['Guest One'] })

  // Boardless sessions auto-activate manual entry (DartKeypad)
  await expect(page.locator('button[aria-label="Single 1"]')).toBeVisible()
  const hostName = `e2eadmin${testInfo.parallelIndex}`

  // Round 1 aims at 1: the host scores a single and misses the rest
  await page.click('button[aria-label="Single 1"]')
  await page.getByRole('button', { name: 'Next player' }).click()
  // The guest throws wide, so round 2 (the number 2) starts with the host again
  await page.getByRole('button', { name: 'Next player' }).click()
  await expect(page.getByText('Round 2 of 7').first()).toBeVisible()

  // A Shanghai of 2 in any order: treble, single, double
  await page.getByRole('button', { name: 'Treble', exact: true }).click()
  await page.click('button[aria-label="Treble 2"]')
  await page.click('button[aria-label="Single 2"]')
  await page.getByRole('button', { name: 'Double', exact: true }).click()
  await page.click('button[aria-label="Double 2"]')
  await page.getByRole('button', { name: 'Finish game' }).click()

  await expect(page.getByText('Shanghai!').first()).toBeVisible()
  await expect(page.getByRole('region', { name: `${hostName} wins` })).toBeVisible()
  await expect(page.getByRole('button', { name: /Rematch/ })).toBeVisible()
})
