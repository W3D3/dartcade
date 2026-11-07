import { test, expect } from '@playwright/test'
import { VIEW, docPath, open, shot } from './helpers.js'

// The Stats page as Admin sees it (stats.enabled is on for admins): the whole page on a desktop and
// a phone, tall enough for every section since the page scrolls inside <main>, and the doubles on
// the board.

const tall = { desktop: { ...VIEW.wide, height: 2550 }, phone: { ...VIEW.phone, height: 5600 } }

test('stats', async ({ browser }) => {
  for (const [view, file] of [
    [tall.desktop, 'stats/stats-desktop.png'],
    [tall.phone, 'stats/stats-phone.png'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/stats')
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
    await shot(page, file)
    await ctx.close()
  }

  const { ctx, page } = await open(browser, 'admin', VIEW.wide)
  await page.goto('/#/stats')
  await page.getByRole('button', { name: 'Board' }).click()
  const doubles = page.getByRole('region', { name: 'Your doubles' })
  await doubles.scrollIntoViewIfNeeded()
  await page.evaluate(() => document.fonts.ready)
  await doubles.screenshot({ path: docPath('stats/stats-doubles-board.png'), animations: 'disabled' })
  await ctx.close()
})
