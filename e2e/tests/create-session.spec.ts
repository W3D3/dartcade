import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

test('New game opens a lobby, a guest joins it, Start opens the game', async ({ authedPage: page }) => {
  await startGame(page, { mode: 'ATC', guests: ['Player Two'] })
  await expect(page.locator('text=Player Two').first()).toBeVisible()
})
