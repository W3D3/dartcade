import { test, expect } from '@playwright/test'
import { open, openHash, shot } from './helpers.js'

// Docs shots for the phone header and tablet rail fixes (#693, #694), docs/layout-fixes/<area>/
// (LAYOUT_SHOT_PREFIX=before|after). The checks are e2e/tests/layout-bounds.spec.ts.

const PREFIX = process.env.LAYOUT_SHOT_PREFIX ?? 'after'
const PHONES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]
const PHONE_PAGES = ['/settings/game', '/profile/customise/picture', '/stats/history', '/play/ranked', '/friends']
const RAILS = [
  { width: 1024, height: 768 },
  { width: 1152, height: 720 },
  { width: 960, height: 600 },
  { width: 844, height: 390 },
]

test('phone header shots', async ({ browser }) => {
  for (const view of PHONES) {
    for (const route of PHONE_PAGES) {
      const { ctx, page } = await open(browser, 'admin', { ...view, scale: 1 })
      await openHash(page, route)
      await expect(page.locator('header h1').locator('visible=true').first()).toBeVisible()
      await shot(page, `layout-fixes/phone-header/${PREFIX}-${view.width}-${route.replaceAll('/', '_')}.png`)
      await ctx.close()
    }
  }
})

test('tablet rail shots', async ({ browser }) => {
  for (const view of RAILS) {
    const { ctx, page } = await open(browser, 'admin', { ...view, scale: 1 })
    await openHash(page, '/stats/history')
    await expect(page.getByRole('navigation', { name: 'Main' }).locator('visible=true').first()).toBeVisible()
    await shot(page, `layout-fixes/nav-rail/${PREFIX}-${view.width}x${view.height}.png`)
    await ctx.close()
  }
})
