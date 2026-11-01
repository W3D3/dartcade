import { test, expect } from '@playwright/test'
import { VIEW, open, shot, openHash, userId, api, closeToasts } from './helpers.js'

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
  const country = admin.page.getByRole('combobox', { name: 'Country' })
  await expect(country).toBeVisible()
  await shot(admin.page, 'profile/settings-profile-desktop.png', { fullPage: true, settle: 1000 })
  await country.click()
  await expect(admin.page.getByRole('option', { name: 'Austria' })).toBeVisible()
  await shot(admin.page, 'profile/settings-country-open-desktop.png', { settle: 800 })
  // The field keeps the focus while typing and moving through the list; Enter on your own country keeps it
  await country.fill('aust')
  await expect(admin.page.getByRole('listbox').getByRole('option')).toHaveCount(2)
  await admin.page.keyboard.press('ArrowDown')
  await expect(country).toBeFocused()
  await admin.page.keyboard.press('Enter')
  await expect(country).toHaveValue('Austria')
  expect(((await api(admin.page).get('/api/me')) as { country: string }).country).toBe('AT')
  // Arrow up to Australia, pick it with Enter, then go back to Austria with the mouse
  await country.click()
  await country.fill('aust')
  await admin.page.keyboard.press('ArrowDown')
  await admin.page.keyboard.press('ArrowUp')
  await admin.page.keyboard.press('Enter')
  await expect(country).toHaveValue('Australia')
  await expect.poll(async () => ((await api(admin.page).get('/api/me')) as { country: string }).country).toBe('AU')
  await country.click()
  await admin.page.getByRole('option', { name: 'Austria' }).click()
  await expect(country).toHaveValue('Austria')
  await expect.poll(async () => ((await api(admin.page).get('/api/me')) as { country: string }).country).toBe('AT')
  await openHash(admin.page, '/settings/profile')
  await admin.page.getByRole('button', { name: /^Account: Admin/ }).click()
  await expect(admin.page.getByRole('menuitem', { name: /^Your profile/ })).toBeVisible()
  await shot(admin.page, 'profile/menu-desktop.png', { settle: 800 })
  await admin.ctx.close()

  const phone = await open(browser, 'admin', VIEW.phone)
  await openHash(phone.page, '/profile')
  await expect(phone.page.getByRole('region', { name: "Admin's card" })).toBeVisible()
  await shot(phone.page, 'profile/profile-phone.png', { settle: 1000 })
  await openHash(phone.page, '/settings/profile')
  await expect(phone.page.getByRole('combobox', { name: 'Country' })).toBeVisible()
  await shot(phone.page, 'profile/settings-profile-phone.png', { fullPage: true, settle: 1000 })
  await phone.page.getByRole('button', { name: /^Account: Admin/ }).click()
  await expect(phone.page.getByRole('menuitem', { name: /^Your profile/ })).toBeVisible()
  await shot(phone.page, 'profile/menu-phone.png', { settle: 800 })
  await phone.page.getByRole('menuitem', { name: /^Your profile/ }).click()
  await expect(phone.page).toHaveURL(/#\/profile$/)
  await phone.ctx.close()

  // With the profile request failing, the menu still has its way in to your profile
  const offline = await open(browser, 'admin', VIEW.phone)
  await offline.page.route('**/api/users/*/profile', route =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }),
  )
  await openHash(offline.page, '/settings/profile')
  await closeToasts(offline.page)
  await offline.page.getByRole('button', { name: /^Account: Admin/ }).click()
  await offline.page.getByRole('menuitem', { name: 'Your profile: Admin' }).click()
  await expect(offline.page).toHaveURL(/#\/profile$/)
  await offline.ctx.close()
})
