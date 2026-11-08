import { test, expect } from '@playwright/test'
import { open, shot } from './helpers.js'

test('lights profile', async ({ browser }) => {
  for (const [view, name] of [
    [{ width: 1440, height: 1250, scale: 2 }, 'desktop'],
    [{ width: 390, height: 1950, scale: 2 }, 'phone'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/settings/lights')
    await expect(page.getByRole('region', { name: 'Light profile' })).toBeVisible()
    await shot(page, `lights/profile-${name}.png`)
    await ctx.close()
  }
})
