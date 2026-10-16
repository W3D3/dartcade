import { test, expect } from '../fixtures/auth.js'
import { LOADS_3D } from '../fixtures/minigolf.js'

test('a non-admin is sent away from the bench', async ({ authedPage: page }) => {
  await page.goto('/#/admin/minigolf')
  await page.waitForURL(url => !url.hash.startsWith('#/admin'))
  await expect(page.getByTestId('hole-3d')).toHaveCount(0)
})

test('an admin putts once on the bench', async ({ adminPage: page }) => {
  await page.goto('/#/admin/minigolf')
  await expect(page.getByTestId('hole-3d')).toBeVisible(LOADS_3D)
  await expect(page.getByTestId('strokes')).toHaveText('Strokes 0')
  const board = page.locator('[aria-label="Dartboard"]')
  const box = (await board.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3) // in the 20: putt up
  await expect(page.getByTestId('strokes')).toHaveText(/Strokes 1|Holed in 1/, { timeout: 15_000 })
})

test('switching the bench to 2D shows the flat view', async ({ adminPage: page }) => {
  await page.goto('/#/admin/minigolf')
  await expect(page.getByTestId('hole-3d')).toBeVisible(LOADS_3D)
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('false')
  await expect(page.getByTestId('hole-view')).toBeVisible()
})
