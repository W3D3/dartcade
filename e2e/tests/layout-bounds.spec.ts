import { test, expect } from '../fixtures/auth.js'
import type { Page } from '@playwright/test'

// #693, #694: the phone header keeps the Report a bug button and the avatar on screen next to a long
// title or a page action, and the tablet rail keeps its account button above the fold on short viewports.

test.setTimeout(90_000)

async function expectInViewport(page: Page, name: string | RegExp) {
  const box = await page.getByRole('button', { name }).locator('visible=true').first().boundingBox()
  const vp = page.viewportSize()!
  expect(box, `${name} is drawn`).not.toBeNull()
  expect(box!.x, `${name} starts on screen`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${name} ends on screen`).toBeLessThanOrEqual(vp.width + 0.5)
  expect(box!.y + box!.height, `${name} above the fold`).toBeLessThanOrEqual(vp.height + 0.5)
}

for (const width of [320, 390, 430]) {
  for (const route of ['/settings/game', '/profile/customise/picture', '/friends', '/history']) {
    test(`phone header at ${width}px on ${route} keeps its buttons on screen`, async ({ authedPage: page }) => {
      await page.setViewportSize({ width, height: 700 })
      await page.goto(`/#${route}`, { waitUntil: 'commit' })
      await expect(page.locator('header h1').locator('visible=true').first()).toBeVisible({ timeout: 60_000 })
      await expectInViewport(page, 'Report a bug')
      await expectInViewport(page, /^Account: /)
      const header = page.locator('header').first()
      expect(await header.evaluate(el => el.scrollWidth <= el.clientWidth), 'header overflows').toBe(true)
    })
  }
}

for (const [width, height] of [
  [1024, 768],
  [1152, 720],
  [960, 600],
  [844, 390],
]) {
  test(`the rail at ${width}x${height} keeps the account button above the fold`, async ({ authedPage: page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/#/history', { waitUntil: 'commit' })
    await expect(page.getByRole('navigation', { name: 'Main' }).locator('visible=true').first()).toBeVisible({ timeout: 60_000 })
    await expectInViewport(page, /^Account: /)
  })
}
