import { test, expect } from '@playwright/test'
import { VIEW, X01, open, shot, hostLobby, leaveLobby, startLobbyGame, endGame, dart, entryMode, openHash } from './helpers.js'

// The live coach beside a solo X01 game (coach.live.enabled, on in the screenshot stack)
test('coach: live panel in solo x01', async ({ browser }) => {
  const phil = await open(browser, 'phil', VIEW.wide)
  const lobby = await hostLobby(phil.page, "Phil's lobby", X01({ startScore: 301 }))
  const session = await startLobbyGame(phil.page, lobby)
  const coach = phil.page.getByRole('complementary', { name: 'Coach' })
  await expect(coach).toBeVisible({ timeout: 20_000 })

  // Visit 1 scores 177 (124 left); the next visit opens with the last one's grade
  await entryMode(phil.page, 'Enter')
  for (const d of ['T20', 'T20', 'T19']) await dart(phil.page, d)
  await phil.page.getByRole('button', { name: 'Next player' }).click()
  await expect(coach.getByRole('heading', { name: /Last visit/ })).toBeVisible()
  await entryMode(phil.page, 'Board')
  await shot(phil.page, 'coach/live-grade-desktop.png')

  // Visit 2: T20 and S16 leave 48 with one dart to go
  await entryMode(phil.page, 'Enter')
  for (const d of ['T20', 'S16']) await dart(phil.page, d)
  await expect(coach.getByText('dart 3 of 3 · 48 left')).toBeVisible()
  await entryMode(phil.page, 'Board')
  await shot(phil.page, 'coach/live-desktop.png')

  const phone = await open(browser, 'phil', VIEW.phone)
  await openHash(phone.page, `/session/${session}`)
  await phone.page.getByText('Coach', { exact: true }).click()
  await expect(phone.page.getByRole('heading', { name: 'Aim now' })).toBeVisible()
  await shot(phone.page, 'coach/live-phone.png')
  await phone.ctx.close()

  await endGame(phil.page)
  await leaveLobby(phil.page)
  await phil.ctx.close()
})
