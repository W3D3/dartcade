import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

test('cricket: a duel ends on the win screen once player 1 opens every target', async ({ adminPage: page }, testInfo) => {
  // Cricket is behind gamemode.cricket.enabled, admins only: adminPage (made an admin by the auth fixture)
  await startGame(page, { mode: 'Cricket', guests: ['Guest One'] })

  // Boardless sessions auto-activate manual entry (DartKeypad)
  await expect(page.locator('button[aria-label="Single 1"]')).toBeVisible()

  // The host's name, as the adminPage fixture signs it up
  const hostName = `e2eadmin${testInfo.parallelIndex}`

  const treble = async (n: number) => {
    await page.getByRole('button', { name: 'Treble', exact: true }).click()
    await page.click(`button[aria-label="Treble ${n}"]`)
  }
  const miss = () => page.click('button[aria-label="Miss"]')
  const next = () => page.getByRole('button', { name: 'Next player' }).click()

  // Player 1 (the host) opens 20, 19 and 18 with trebles, over two visits with the guest's
  // misses between them
  await treble(20)
  await treble(19)
  await treble(18)
  await next()
  await miss()
  await miss()
  await miss()
  await next()

  await expect(page.locator(`td[aria-label="${hostName}, 20: opened, can score"]`)).toBeVisible()

  // ...then 17, 16 and 15
  await treble(17)
  await treble(16)
  await treble(15)
  await next()
  await miss()
  await miss()
  await miss()
  await next()

  // Only the bull is left: a double bull (2 marks) then an outer bull (1 mark) opens it on the
  // visit's second dart, mid-visit, while player 1 isn't behind on points. That wins the game
  // outright, and the Next player button becomes Finish game, waiting for a correction before
  // it commits.
  await page.click('button[aria-label="Bull, 50"]')
  await expect(page.locator(`td[aria-label="${hostName}, Bull: 2 marks"]`)).toBeVisible()
  await page.click('button[aria-label="Outer bull, 25"]')
  await expect(page.getByRole('button', { name: 'Finish game' })).toBeEnabled()
  await page.getByRole('button', { name: 'Finish game' }).click()

  // The win screen: player 1 closed the board first, host as winner, rematch available
  await expect(page.getByRole('region', { name: `${hostName} wins` })).toBeVisible()
  await expect(page.getByRole('button', { name: /Rematch/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to lobby' })).toBeVisible()
})
