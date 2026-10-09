import { test, expect } from '../fixtures/auth.js'

test('a non-admin is sent away from the bench', async ({ authedPage: page }) => {
  await page.goto('/#/admin/minigolf')
  await page.waitForURL(url => !url.hash.startsWith('#/admin'))
  await expect(page.getByTestId('hole-view')).toHaveCount(0)
})

test('an admin putts once on the bench', async ({ page }) => {
  const email = 'e2e-admin@test.local' // ADMIN_EMAILS in docker-compose.e2e.yaml
  const password = 'TestPass1!'
  const headers = { Origin: 'http://localhost:5174' }
  await page.request.post('http://localhost:5174/api/auth/sign-up/email', { data: { name: 'e2eadmin', email, password }, headers })
  const signIn = await page.request.post('http://localhost:5174/api/auth/sign-in/email', { data: { email, password }, headers })
  expect(signIn.ok()).toBeTruthy()

  await page.goto('/#/admin/minigolf')
  await expect(page.getByTestId('hole-view')).toBeVisible()
  await expect(page.getByTestId('strokes')).toHaveText('Strokes 0')
  const board = page.locator('[aria-label="Dartboard"]')
  const box = (await board.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3) // in the 20: putt up
  await expect(page.getByTestId('strokes')).toHaveText(/Strokes 1|Holed in 1/, { timeout: 15_000 })
})
