import { test, expect } from '@playwright/test'
import { open, openHash, openAccountMenu, closeToasts, shot } from './helpers.js'
import type { View } from './helpers.js'

// The phone's burger menu (a left drawer with every page) and the slimmed account menu; docs/mobile-menu/<size>-<scene>.png.
// MENU_SHOTS=before takes the same scenes on the old code (prefix `before-`, no burger to check).

const before = process.env.MENU_SHOTS === 'before'
const SIZES = {
  phone: { width: 390, height: 844, scale: 2 },
  'phone-small': { width: 320, height: 640, scale: 2 },
  tablet: { width: 820, height: 1180, scale: 1 },
} satisfies Record<string, View>
const file = (size: string, scene: string) => `mobile-menu/${before ? 'before-' : ''}${size}-${scene}.png`

for (const [size, view] of Object.entries(SIZES)) {
  test(`${size}: the header, the menu and the account menu`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await openHash(page, '/history')
    await closeToasts(page)
    const burger = page.getByRole('button', { name: 'Menu' })
    if (!before) await expect(burger).toHaveCount(size === 'tablet' ? 0 : 1)
    await shot(page, file(size, 'closed'))

    if (!before && size !== 'tablet') {
      await burger.click()
      const menu = page.getByRole('dialog')
      await expect(menu).toBeVisible()
      for (const name of ['Home', 'Play', 'History', 'Settings', 'Admin']) await expect(menu.getByRole('link', { name })).toBeVisible()
      for (const gone of ['Boards', 'Progress', 'Friends']) await expect(menu.getByRole('link', { name: gone, exact: true })).toHaveCount(0)
      await expect(menu.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page')
      await shot(page, file(size, 'open'))
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(burger).toBeFocused()

      await burger.click()
      await menu.getByRole('link', { name: 'Settings' }).click()
      await expect(page).toHaveURL(/#\/settings/)
      await expect(menu).toBeHidden()
    }

    if (size !== 'tablet') {
      await openHash(page, '/history')
      await closeToasts(page)
      await openAccountMenu(page)
      if (!before) {
        for (const name of ['Stats', 'Admin']) await expect(page.getByRole('menuitem', { name, exact: true })).toHaveCount(0)
        for (const name of [/^Friends/, /^Progress/]) await expect(page.getByRole('menuitem', { name })).toHaveCount(1)
      }
      await shot(page, file(size, 'account-menu'))
    }
    await ctx.close()
  })
}
