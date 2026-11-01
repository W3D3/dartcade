import { test, expect } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The Game card on the Boards page: Next player also resets the board, on by default
for (const [view, name] of [
  [VIEW.wide, 'desktop'],
  [VIEW.phone, 'phone'],
] as const) {
  test(`reset the board on Next player, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/settings/boards')
    const toggle = page.getByRole('switch', { name: 'Reset the board on Next player' })
    await toggle.scrollIntoViewIfNeeded()
    await expect(toggle).toBeChecked()
    await shot(page, `reset-on-next/on-${name}.png`)
    await toggle.click()
    await expect(toggle).not.toBeChecked()
    await shot(page, `reset-on-next/off-${name}.png`)
    await toggle.click()
    await expect(toggle).toBeChecked()
    await ctx.close()
  })
}
