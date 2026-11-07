import { test, expect } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The stats components' showcase (#/dev/stats, dev server only) with its made-up numbers: every
// tile, chart, list and state the Stats page builds on, at a desktop, a tablet and two phones.

test('stats components', async ({ browser }) => {
  for (const [view, file] of [
    [{ ...VIEW.wide, height: 2700 }, 'stats/components-desktop.png'],
    [{ ...VIEW.tabletPortrait, height: 3600 }, 'stats/components-tablet.png'],
    [{ ...VIEW.phone, height: 6400 }, 'stats/components-phone.png'],
    [{ ...VIEW.smallPhone, height: 6800 }, 'stats/components-phone-360.png'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/dev/stats')
    await expect(page.getByRole('heading', { name: 'Range pickers' })).toBeVisible()
    await shot(page, file)
    await ctx.close()
  }
})
