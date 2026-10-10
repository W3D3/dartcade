import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

test('minigolf: a putt clicked on the board counts once the darts are pulled', async ({ authedPage: page }) => {
  await startGame(page, { mode: 'Minigolf', guests: ['Lena'] })
  await expect(page.getByLabel('Hole', { exact: true })).toBeVisible()
  const rows = page.getByTestId('minigolf-player')
  await expect(rows.first()).toContainText('Putting')

  // A dart in the 20, halfway out: the ball rolls up the hole
  const board = page.locator('[aria-label="Dartboard"]')
  const box = (await board.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3)
  await expect(page.getByLabel('Tries')).toContainText('S20')

  // Pull the darts: the stroke counts and Lena is up
  await page.getByRole('button', { name: /Next player|Skip to next/ }).click()
  // Rows keep the hole's turn order
  await expect(rows.nth(1)).toContainText('Lena')
  await expect(rows.nth(1)).toContainText('Putting')
  await expect(rows.first().getByTestId('hole-strokes')).toHaveText('1')
})
