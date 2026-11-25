import { test, expect, type Page } from '@playwright/test'
import {
  VIEW,
  X01,
  addGuest,
  api,
  dart,
  entryMode,
  hostLobby,
  leaveLobby,
  open,
  openHash,
  shot,
  startLobbyGame,
  userId,
  type View,
} from './helpers.js'

// Claim guests on a finished game (match details): Michael hosted a game with a guest, asks his
// friend Phil to take over her seat; Phil sees the invite (toast, Invites page) and accepts.
async function befriend(admin: Page, michael: Page, phil: Page): Promise<void> {
  await api(admin).put('/api/admin/flags/guestClaims.enabled', { mode: 'users', userIds: [await userId(michael), await userId(phil)] })
  await api(michael).tryPost('/api/friends/requests', { name: 'phil' })
  await api(phil).tryPost('/api/friends/requests', { name: 'michael' })
}

async function playedGame(page: Page): Promise<string> {
  const lobby = await hostLobby(page, "Michael's lobby", X01({ startScore: 32, firstTo: 1 }))
  await addGuest(page, lobby, 'Pia')
  const sessionId = await startLobbyGame(page, lobby)
  await entryMode(page, 'Enter')
  await dart(page, 'D16')
  await page.getByRole('button', { name: 'Finish game' }).click()
  await expect(
    page
      .getByRole('heading', { name: /wins/i })
      .or(page.getByRole('region', { name: /wins/i }))
      .first(),
  ).toBeVisible()
  await leaveLobby(page)
  return sessionId
}

for (const [view, suffix] of [
  [VIEW.wide, 'desktop'],
  [VIEW.phone, 'phone'],
] as [View, string][]) {
  test(`guest claim: ${suffix}`, async ({ browser }) => {
    test.setTimeout(240_000)
    const admin = await open(browser, 'admin', view)
    const michael = await open(browser, 'michael', view)
    const phil = await open(browser, 'phil', view)
    await befriend(admin.page, michael.page, phil.page)
    const id = await playedGame(michael.page)
    await openHash(phil.page, '/invites')
    // The push is not stored: /ws/me has to be up before the host asks
    await phil.page.waitForTimeout(3000)

    await openHash(michael.page, `/stats/history/${id}`)
    await michael.page.getByRole('button', { name: 'Claim guests' }).click()
    const dialog = michael.page.getByRole('dialog')
    await dialog.getByRole('combobox', { name: 'Friend for Pia' }).click()
    await expect(michael.page.getByRole('option', { name: /Phil/ })).toBeVisible()
    await shot(michael.page, `guest-claim/dialog-pick-${suffix}.png`, { keepToasts: true })
    await michael.page.getByRole('option', { name: /Phil/ }).click()
    await expect(dialog.getByText('Waiting for')).toBeVisible()
    await shot(michael.page, `guest-claim/dialog-waiting-${suffix}.png`, { keepToasts: true })

    await expect(phil.page.getByRole('listitem', { name: 'Claim Pia' })).toBeVisible()
    await shot(phil.page, `guest-claim/invite-${suffix}.png`, { keepToasts: true })
    await phil.page.getByRole('listitem', { name: 'Claim Pia' }).getByRole('button', { name: 'Take over' }).click()
    await expect(phil.page.getByRole('listitem', { name: 'Claim Pia' })).toHaveCount(0)
    await openHash(phil.page, '/stats/history')
    await expect(phil.page.locator('tr, li').filter({ visible: true, hasText: 'Michael' }).first()).toBeVisible()
    await admin.ctx.close()
    await michael.ctx.close()
    await phil.ctx.close()
  })
}
