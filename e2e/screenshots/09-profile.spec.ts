import { test, expect } from '@playwright/test'
import { VIEW, open, shot, openHash, userId, api } from './helpers.js'

// Profile: the flag and the average badge next to the name, and Settings → Profile's country picker.
// Admin shows Austria; Luke shows no country.

test('profile: the flag and average badge, and the country picker in Settings', async ({ browser }) => {
  test.setTimeout(120_000)
  const admin = await open(browser, 'admin', VIEW.wide)
  await api(admin.page).patch('/api/me', { country: 'AT' })
  const luke = await open(browser, 'luke', VIEW.wide)
  const lukeId = await userId(luke.page)
  await luke.ctx.close()

  await openHash(admin.page, `/profile/${lukeId}`)
  await expect(admin.page.getByRole('region', { name: "Luke's card" })).toBeVisible()
  await shot(admin.page, 'profile/profile-other-desktop.png', { settle: 1000 })
  await openHash(admin.page, '/profile')
  await expect(admin.page.getByRole('region', { name: "Admin's card" })).toBeVisible()
  await shot(admin.page, 'profile/profile-self-desktop.png', { settle: 1000 })

  await openHash(admin.page, '/settings/profile')
  await expect(admin.page.getByRole('combobox', { name: 'Country' }).or(admin.page.getByRole('button', { name: 'Country' }))).toBeVisible()
  await shot(admin.page, 'profile/settings-profile-desktop.png', { fullPage: true, settle: 1000 })
  await admin.page.getByRole('button', { name: 'Country' }).click()
  await expect(admin.page.getByRole('option', { name: 'Austria' })).toBeVisible()
  await admin.page.getByRole('option', { name: 'Austria' }).scrollIntoViewIfNeeded()
  await shot(admin.page, 'profile/settings-country-open-desktop.png', { settle: 800 })
  await admin.ctx.close()

  const phone = await open(browser, 'admin', VIEW.phone)
  await openHash(phone.page, '/profile')
  await expect(phone.page.getByRole('region', { name: "Admin's card" })).toBeVisible()
  await shot(phone.page, 'profile/profile-phone.png', { settle: 1000 })
  await openHash(phone.page, '/settings/profile')
  await expect(phone.page.getByRole('button', { name: 'Country' })).toBeVisible()
  await shot(phone.page, 'profile/settings-profile-phone.png', { fullPage: true, settle: 1000 })
  await phone.ctx.close()
})
