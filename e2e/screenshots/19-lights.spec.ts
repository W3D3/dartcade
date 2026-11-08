import { test, expect } from '@playwright/test'
import { open, shot } from './helpers.js'

const VIEWS = [
  [{ width: 1440, height: 1750, scale: 2 }, 'desktop'],
  [{ width: 390, height: 2400, scale: 2 }, 'phone'],
] as const

test('lights profile: the seat colours group on top, a seat colour picker, a saved colour', async ({ browser }) => {
  for (const [view, name] of VIEWS) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/settings/lights')
    await expect(page.getByRole('region', { name: 'Light profile' })).toBeVisible()
    await shot(page, `lights/profile-${name}.png`)

    await page.getByRole('button', { name: /^Seat 3 colour: orange/ }).click()
    await expect(page.getByRole('radiogroup', { name: 'Seat 3 colour' })).toBeVisible()
    await shot(page, `lights/picker-${name}.png`)

    await page.getByRole('radio', { name: 'blue' }).click()
    await expect(page.getByRole('button', { name: /^Seat 3 colour: blue/ })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: /^Seat 3 colour: blue/ })).toBeVisible()
    await shot(page, `lights/edited-${name}.png`)

    await page.getByRole('button', { name: 'Reset to defaults' }).click()
    await expect(page.getByRole('button', { name: /^Seat 3 colour: orange/ })).toBeVisible()
    await ctx.close()
  }
})
