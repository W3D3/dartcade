import { test, expect } from '@playwright/test'
import {
  VIEW,
  X01,
  addGuest,
  dart,
  endGame,
  entryMode,
  hostLobby,
  leaveLobby,
  open,
  openHash,
  shot,
  startLobbyGame,
  userId,
} from './helpers.js'

// Watch: Admin watches Luke's running X01 game (they are friends; Gerwyn is only a pending request, so he may not).
// Luke throws on his own page; Admin's page is the view-only one. Each assertion is the behaviour, the shots are the evidence.

test('watch: a friend’s running game, view only', async ({ browser }) => {
  test.setTimeout(180_000)
  const luke = await open(browser, 'luke', VIEW.wide)
  const lobby = await hostLobby(luke.page, 'Friday darts', X01({ startScore: 101, firstTo: 1 }))
  await addGuest(luke.page, lobby, 'Anna')
  const session = await startLobbyGame(luke.page, lobby)
  await entryMode(luke.page, 'Enter')
  for (const d of ['T20', 'S20', 'S5']) await dart(luke.page, d)
  await luke.page.getByRole('button', { name: 'Next player' }).click()
  for (const d of ['S1', 'S1', 'S1']) await dart(luke.page, d)
  await luke.page.getByRole('button', { name: 'Next player' }).click()

  // The entry points: the Friends page, his profile and Home
  const admin = await open(browser, 'admin', VIEW.desktop)
  await admin.page.goto('/#/friends')
  await expect(admin.page.getByRole('button', { name: 'Watch Luke' })).toBeVisible({ timeout: 15_000 })
  await shot(admin.page, 'watch/friends-watch-desktop.png')

  await openHash(admin.page, `/profile/${await userId(luke.page)}`)
  await expect(admin.page.getByRole('link', { name: 'Watch' })).toBeVisible({ timeout: 15_000 })
  await shot(admin.page, 'watch/profile-watch-desktop.png')

  await openHash(admin.page, '/')
  const homeWatch = admin.page.getByRole('button', { name: /^Watch/ }).first()
  await expect(homeWatch).toBeVisible({ timeout: 15_000 })
  await homeWatch.scrollIntoViewIfNeeded()
  await shot(admin.page, 'watch/home-watch-desktop.png')

  // Watching: the match screen, nothing to press, and who you are watching
  await admin.page.goto('/#/friends')
  await admin.page.getByRole('button', { name: 'Watch Luke' }).click()
  await expect(admin.page.getByText('You are watching')).toBeVisible()
  await expect(admin.page.getByText('LIVE', { exact: true })).toBeVisible()
  await expect(admin.page.getByRole('button', { name: 'Stop watching' })).toBeVisible()
  for (const name of ['Next player', 'Undo', 'Enter', 'Settings', 'End', 'Leave']) {
    await expect(admin.page.getByRole('button', { name })).toHaveCount(0)
  }
  await shot(admin.page, 'watch/watching-desktop.png')

  // The players see that someone watches
  await expect(luke.page.getByText('1 watching')).toBeVisible()
  await shot(luke.page, 'watch/players-see-watchers-desktop.png')

  // The view follows the game
  await dart(luke.page, 'S1')
  await expect(admin.page.getByText('S1').first()).toBeVisible()

  // A phone
  const phone = await open(browser, 'admin', VIEW.phone)
  await openHash(phone.page, `/watch/${session}`)
  await expect(phone.page.getByText('You are watching')).toBeVisible()
  await shot(phone.page, 'watch/watching-phone.png')
  await phone.ctx.close()

  // Not a friend: refused
  const gerwyn = await open(browser, 'gerwyn', VIEW.desktop)
  await openHash(gerwyn.page, `/watch/${session}`)
  await expect(gerwyn.page.getByText("You can't watch this game")).toBeVisible()
  await shot(gerwyn.page, 'watch/not-allowed-desktop.png')
  await gerwyn.ctx.close()

  // The game ends: the result, then back
  await luke.page.getByRole('button', { name: 'Undo' }).click()
  await dart(luke.page, 'D8')
  await luke.page.getByRole('button', { name: 'Finish game' }).click()
  await expect(admin.page.getByText('GAME OVER', { exact: true })).toBeVisible({ timeout: 15_000 })
  await shot(admin.page, 'watch/result-desktop.png')
  await admin.page.getByRole('button', { name: 'Back' }).click()
  await expect(admin.page).toHaveURL(/#\/friends/)
  await admin.ctx.close()

  await luke.ctx.close()
})
