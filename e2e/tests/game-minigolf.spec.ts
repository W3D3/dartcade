import { test, expect } from '../fixtures/auth.js'
import type { Page } from '@playwright/test'
import { startGame } from '../fixtures/lobby.js'

/** Starts a game with the guest Lena and aims the first putt: a dart in the 20, halfway out, rolls the ball up the hole. */
async function aimFirstPutt(page: Page) {
  await startGame(page, { mode: 'Minigolf', guests: ['Lena'] })
  await expect(page.getByLabel('Hole', { exact: true })).toBeVisible()
  const rows = page.getByTestId('minigolf-player')
  await expect(rows.first()).toContainText('Putting')
  const board = page.locator('[aria-label="Dartboard"]')
  const box = (await board.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3)
  await expect(page.getByLabel('Tries')).toContainText('S20')
  return rows
}

test('minigolf: a putt clicked on the board counts once shot', async ({ adminPage: page }) => {
  test.setTimeout(45_000) // 3D physics + WebGL rendering leave less margin than the 2D game did
  const rows = await aimFirstPutt(page)

  // Games play in 3D: the chase-cam canvas is up
  await expect(page.locator('[data-testid=hole-3d] canvas')).toBeVisible()

  // Shoot (as pulling the darts would): the stroke counts and Lena is up once it has rolled
  await page.getByRole('button', { name: 'Shoot' }).click()
  // Rows keep the hole's turn order
  await expect(rows.nth(1)).toContainText('Lena')
  // A 3 s pause, then the roll (slow motion near the cup); only then is the next player up
  await expect(rows.nth(1)).toContainText('Putting', { timeout: 35_000 })
  await expect(rows.first().getByTestId('hole-strokes')).toHaveText('1')
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  // iPads often have Reduce Motion on: the ball used to jump to where it stopped, the roll unseen
  test('minigolf: the ball still rolls', async ({ adminPage: page }) => {
    test.setTimeout(45_000)
    const rows = await aimFirstPutt(page)
    await page.getByRole('button', { name: 'Shoot' }).click()
    const shot = Date.now()
    await expect(rows.nth(1)).toContainText('Putting', { timeout: 35_000 })
    // The 3 s pause, then a roll of about 2.5 s; a jump to the end is up just after the pause
    expect(Date.now() - shot).toBeGreaterThan(4500)
  })
})

test('minigolf is offered to plain players, it is on for everyone', async ({ authedPage: page }) => {
  await page.goto('/#/play')
  const main = page.locator('main')
  await expect(main.getByRole('button', { name: /^X01:/ })).toBeVisible()
  await expect(main.locator('button:has-text("Minigolf")')).toHaveCount(1)
})
