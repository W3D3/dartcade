import { test, expect } from '@playwright/test'
import { VIEW, open, shot, hostLobby, leaveLobby, api, openAccountMenu, userId, X01 } from './helpers.js'

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
