import { test, expect } from '@playwright/test'
import { open, openHash, closeToasts, shot } from './helpers.js'
import type { View } from './helpers.js'

// The History header no longer carries the Coach link; a finished X01 game's details has one Coach review button.
// docs/coach-review-button/<size>-<scene>.png; COACH_SHOTS=before takes the same scenes on the old code.

const before = process.env.COACH_SHOTS === 'before'
const SIZES = {
  desktop: { width: 1440, height: 900, scale: 1 },
  phone: { width: 390, height: 844, scale: 2 },
} satisfies Record<string, View>

for (const [size, view] of Object.entries(SIZES)) {
  test(`${size}: history and match details`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await openHash(page, '/history')
    await closeToasts(page)
    await expect(page.getByRole('link', { name: /review your X01 games/ })).toHaveCount(before ? 1 : 0)
    await shot(page, `coach-review-button/${before ? 'before-' : ''}${size}-history.png`)

    await page
      .locator('tr, li')
      .filter({ visible: true, hasText: 'Phil' })
      .first()
      .getByRole('link', { name: /X01.*details/ })
      .click({ position: { x: 8, y: 8 } })
    await page.waitForURL(url => url.hash.startsWith('#/history/'))
    await expect(page.getByRole('tab', { name: 'Heatmap' })).toBeVisible()
    if (!before) {
      const review = page.getByRole('link', { name: 'Coach review' })
      await expect(review).toHaveCount(1)
      await review.scrollIntoViewIfNeeded()
    }
    await shot(page, `coach-review-button/${before ? 'before-' : ''}${size}-details.png`)
    await ctx.close()
  })
}
