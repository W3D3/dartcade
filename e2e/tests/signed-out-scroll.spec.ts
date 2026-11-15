import { test, expect } from '@playwright/test'

// Phone-sized, so each page is taller than the screen. The body never scrolls (the app shell scrolls
// inside itself), so a signed-out page has to scroll inside its own root. Real wheel input, because a
// script setting scrollTop scrolls even where the user can't.
test.use({ viewport: { width: 390, height: 500 } })

const scrolledBy = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const roots = [document.scrollingElement as HTMLElement, ...document.querySelectorAll<HTMLElement>('body *')]
    return Math.max(...roots.map(el => el.scrollTop))
  })

for (const route of ['/#/login', '/#/register', '/#/terms', '/#/privacy', '/#/forgot', '/#/join/ABCDEF']) {
  test(`${route} scrolls on a phone`, async ({ page }) => {
    await page.goto(route)
    await page.locator('h1').first().waitFor()
    await page.mouse.move(200, 250)
    await page.mouse.wheel(0, 400)
    await expect.poll(() => scrolledBy(page)).toBeGreaterThan(0)
  })
}

test('the logo on a phone goes back to the main page', async ({ page }) => {
  await page.goto('/#/terms')
  await page.getByRole('link', { name: 'DARTCADE', exact: true }).first().click()
  await expect(page).not.toHaveURL(/terms/)
})
