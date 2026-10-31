import { test, expect } from '@playwright/test'
import { VIEW, open, shot, hostLobby, leaveLobby, api, docPath, openAccountMenu, userId, X01 } from './helpers.js'

// Pages that need no game: the seed's friends, its lobby (Luke's, with Phil, inviting Admin) and history

test('friends and the account menu', async ({ browser }) => {
  // Luke and Phil online (their /ws/me sockets), so Admin sees them as friends who are on
  const luke = await open(browser, 'luke', VIEW.desktop)
  const phil = await open(browser, 'phil', VIEW.desktop)
  await luke.page.goto('/#/lobby')
  await phil.page.goto('/#/history')

  for (const [view, file] of [
    [VIEW.desktop, 'friends/friends-desktop.png'],
    [VIEW.phone, 'friends/friends-phone.png'],
    [VIEW.tabletHiDpi, 'friends/friends-tablet.png'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/friends')
    await expect(page.getByText('Luke', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/In Luke's lobby/).first()).toBeVisible()
    await shot(page, file)
    await ctx.close()
  }

  for (const [view, file] of [
    [VIEW.desktop, 'friends/account-menu-desktop.png'],
    [VIEW.phone, 'friends/account-menu-phone.png'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/friends')
    await expect(page.getByText(/In Luke's lobby/).first()).toBeVisible()
    await openAccountMenu(page)
    await shot(page, file)
    await ctx.close()
  }

  // Admin's own lobby: friends who are online show as one-tap invites
  {
    const { ctx, page } = await open(browser, 'admin', VIEW.desktop)
    await hostLobby(page, "Admin's lobby", X01())
    await page.goto('/#/lobby')
    await expect(page.getByRole('button', { name: /Phil/ }).first()).toBeVisible()
    await shot(page, 'friends/lobby-desktop.png')
    await page.setViewportSize(VIEW.phone)
    await ctx.close()
    const phone = await open(browser, 'admin', VIEW.phone)
    await phone.page.goto('/#/lobby')
    await expect(phone.page.getByRole('heading', { name: "Admin's lobby" })).toBeVisible()
    await shot(phone.page, 'friends/lobby-phone.png')
    await leaveLobby(phone.page)
    await phone.ctx.close()
  }

  // Invites: Luke's invite waits for Admin (the seed sent it; sent again in case a rerun declined it)
  {
    const { ctx, page } = await open(browser, 'admin', VIEW.phone)
    const lukesLobby = (await api(luke.page).get('/api/lobbies/current')) as { id: string }
    await api(luke.page).tryPost(`/api/lobbies/${lukesLobby.id}/invites`, { userId: await userId(page) })
    await page.goto('/#/invites')
    await expect(page.getByText("Luke's lobby").first()).toBeVisible()
    await shot(page, 'lobby/invites-phone.png')
    await ctx.close()
  }

  await luke.ctx.close()
  await phil.ctx.close()
})

test('settings', async ({ browser }) => {
  for (const [view, route, file] of [
    [VIEW.wide, '/settings/profile', 'settings/profile-desktop.png'],
    [VIEW.wide, '/settings/game', 'settings/game-preferences-desktop.png'],
    [VIEW.phone, '/settings', 'settings/settings-phone.png'],
    [VIEW.tablet, '/settings/boards', 'tablet/boards-1180x820.png'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto(`/#${route}`)
    await expect(page.getByRole('heading', { name: 'Settings' }).first()).toBeVisible()
    await shot(page, file)
    await ctx.close()
  }
})

test('sign in, play, history', async ({ browser }) => {
  {
    const { ctx, page } = await open(browser, null, VIEW.tablet)
    await page.goto('/#/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await shot(page, 'tablet/login-1180x820.png')
    await ctx.close()
  }

  // Admin declines Luke's invite: the rest of the shots show no invite
  {
    const { ctx, page } = await open(browser, 'admin', VIEW.tablet)
    const { invites } = (await api(page).get('/api/invites')) as { invites: { id: string }[] }
    for (const i of invites) await api(page).post(`/api/invites/${i.id}/decline`)

    await page.goto('/#/')
    await expect(page.locator('main').getByRole('button', { name: /^X01:/ })).toBeVisible()
    await shot(page, 'tablet/play-1180x820.png')

    await openAccountMenu(page)
    await page.waitForTimeout(300)
    await shot(page, 'tablet/shell-menu-1180x820.png')
    await page.keyboard.press('Escape')

    await page.goto('/#/history')
    await expect(page.getByRole('link', { name: /X01.*details/ }).first()).toBeVisible()
    await shot(page, 'tablet/history-1180x820.png')
    await ctx.close()
  }

  for (const [view, file] of [
    [VIEW.wide, 'play/play-desktop.png'],
    [VIEW.phone, 'play/play-phone.png'],
    [VIEW.wide, 'lobby/new-game-desktop.png'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/')
    const x01 = page.locator('main').getByRole('button', { name: /^X01:/ })
    await expect(x01).toBeVisible()
    if (file.startsWith('lobby/')) {
      await x01.click()
      await expect(page.getByRole('button', { name: /Choose players/ })).toBeVisible()
    }
    await shot(page, file)
    await ctx.close()
  }
  {
    const { ctx, page } = await open(browser, 'admin', VIEW.phone)
    await page.goto('/#/')
    await page.locator('main').getByRole('button', { name: /^X01:/ }).click()
    await expect(page.getByRole('button', { name: /Choose players/ })).toBeVisible()
    await shot(page, 'lobby/new-game-phone.png')
    await ctx.close()
  }
})

test('admin: hub and users', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.desktop)

  await page.goto('/#/admin')
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Feature flags' })).toBeVisible()
  await shot(page, 'admin/hub-desktop.png')

  // Phil verified, everyone else not: the Verified column shows both states
  const phil = await open(browser, 'phil', VIEW.desktop)
  const philId = await userId(phil.page)
  await phil.ctx.close()
  await api(page).put(`/api/admin/users/${philId}/verified`, { verified: true })
  // Michael unverified, so a rerun on a kept stack starts from the same page
  const michael = await open(browser, 'michael', VIEW.desktop)
  const michaelId = await userId(michael.page)
  await michael.ctx.close()
  await api(page).put(`/api/admin/users/${michaelId}/verified`, { verified: false })

  await page.goto('/#/admin/users')
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  await expect(page.locator('main').getByText('Admin', { exact: true }).first()).toBeVisible()
  await shot(page, 'admin/users-desktop.png')

  // A row button: click, confirm, the dialog closes and the page is interactive again
  // (no stray overlay left capturing clicks) and the row reflects the change
  const row = page.getByRole('row').filter({ hasText: 'Michael' })
  await row.getByRole('button', { name: 'Mark verified' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Mark verified' }).click()
  await expect(dialog).toBeHidden()
  await expect(row.getByRole('button', { name: 'Mark unverified' })).toBeVisible()

  // Something to show in Phil's audit log, then the log itself
  await api(page).post(`/api/admin/users/${philId}/xp`, { amount: 1000 })
  await page.getByRole('row').filter({ hasText: /phil/i }).getByRole('button', { name: 'Audit log' }).click()
  const audit = page.getByRole('dialog')
  await expect(audit.getByText('Gave XP').first()).toBeVisible()
  await audit.screenshot({ path: docPath('admin/user-audit-desktop.png'), animations: 'disabled' })
  await audit.getByRole('button', { name: 'Close' }).click()

  await ctx.close()
})

test('admin: feature flags', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.desktop)

  // The table, grouped by feature, with the feature chips over it
  await page.goto('/#/admin/flags')
  await expect(page.getByRole('heading', { name: 'Feature flags' })).toBeVisible()
  await expect(page.getByRole('row', { name: 'Open details for gamemode.p121.enabled' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Filter by feature' })).toBeVisible()
  await shot(page, 'admin/flags-desktop.png')

  // A row's details card beside the narrowed table: Global and Conditional. Pick a different mode
  // first (not saved yet), so the footer shows "Unsaved changes" and an enabled Save.
  await page.getByRole('row', { name: 'Open details for gamemode.hilo.enabled' }).click()
  const panel = page.getByRole('region', { name: 'gamemode.hilo.enabled' })
  await expect(panel.getByRole('heading', { name: 'gamemode.hilo.enabled' })).toBeVisible()
  await panel.getByRole('button', { name: 'Everyone', exact: true }).click()
  await expect(panel.getByText('Unsaved changes')).toBeVisible()
  await shot(page, 'admin/flag-panel-desktop.png')

  await ctx.close()

  // On a phone the table takes the page
  const phone = await open(browser, 'admin', VIEW.phone)
  await phone.page.goto('/#/admin/flags')
  await expect(phone.page.getByRole('row', { name: 'Open details for gamemode.p121.enabled' })).toBeVisible()
  await shot(phone.page, 'admin/flags-phone.png')
  await phone.ctx.close()
})

test('admin: system', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.desktop)
  await page.goto('/#/admin/system')
  await expect(page.getByRole('heading', { name: 'Config' })).toBeVisible()
  await shot(page, 'admin/system-desktop.png')
  await ctx.close()
})
