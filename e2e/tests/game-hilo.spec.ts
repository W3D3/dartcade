import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

test('higher lower: a duel ends on the win screen once a life is lost at 1 life', async ({ adminPage: page }, testInfo) => {
  // Higher Lower is behind gamemode.hilo.enabled, admins only: adminPage (made an admin by the auth fixture)
  await startGame(page, {
    mode: 'Higher Lower',
    guests: ['Guest One'],
    setup: async page => {
      const fewer = page.getByRole('button', { name: 'Fewer lives' })
      await fewer.click() // 3 -> 2
      await fewer.click() // 2 -> 1
    },
  })

  // Boardless sessions auto-activate manual entry (DartKeypad)
  await expect(page.locator('button[aria-label="Single 1"]')).toBeVisible()

  // The host's name, as the adminPage fixture signs it up
  const hostName = `e2eadmin${testInfo.parallelIndex}`

  // Player 1 (the host) throws T20, S1, S1 = 62: above the start high bar (41), sets HIGH
  await page.getByRole('button', { name: 'Treble', exact: true }).click()
  await page.click('button[aria-label="Treble 20"]')
  await page.click('button[aria-label="Single 1"]')
  await page.click('button[aria-label="Single 1"]')
  await page.getByRole('button', { name: 'Next player' }).click()
  await expect(page.getByText('Set HIGH').first()).toBeVisible()

  // The guest throws S20, S5, S5 = 30: between the bars (21-62). With one life, that's out,
  // and with only one seat left in, the visit decides the game: it waits for Finish.
  await page.click('button[aria-label="Single 20"]')
  await page.click('button[aria-label="Single 5"]')
  await page.click('button[aria-label="Single 5"]')
  await page.getByRole('button', { name: 'Finish game' }).click()

  // The win screen: last one standing, the host as winner, rematch available
  await expect(page.getByText('Last one standing')).toBeVisible()
  await expect(page.getByRole('region', { name: `${hostName} wins` })).toBeVisible()
  await expect(page.getByRole('button', { name: /Rematch/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to lobby' })).toBeVisible()
})
