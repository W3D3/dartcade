import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  VIEW,
  open,
  shot,
  hostLobby,
  joinLobby,
  leaveLobby,
  addGuest,
  addBot,
  api,
  userId,
  X01,
  startLobbyGame,
  endGame,
  dart,
  docPath,
} from './helpers.js'

const people = (page: Page) => page.locator('main')

test('a lobby: host, invited, member, start problem', async ({ browser }) => {
  const admin = await open(browser, 'admin', VIEW.wide)
  const gerwyn = await open(browser, 'gerwyn', VIEW.phone)
  const michael = await open(browser, 'michael', VIEW.phone)
  const lobby = await hostLobby(admin.page, 'Friday Night Darts', X01())
  // Sarah throws at Admin's board (the Dev Board: offline, so Start warns about it)
  await api(admin.page).post(`/api/lobbies/${lobby.id}/people`, { name: 'Sarah' })
  await leaveLobby(gerwyn.page)
  await leaveLobby(michael.page)
  for (const who of [gerwyn, michael]) await api(admin.page).post(`/api/lobbies/${lobby.id}/invites`, { userId: await userId(who.page) })

  await admin.page.goto('/#/lobby')
  await expect(people(admin.page).getByText('Michael').first()).toBeVisible()
  await shot(admin.page, 'lobby/lobby-invited-desktop.png')

  // Gerwyn joins from his phone and stays on the lobby page (online in the list)
  await joinLobby(gerwyn.page, lobby)
  await gerwyn.page.goto('/#/lobby')
  await expect(people(gerwyn.page).getByText('Friday Night Darts').first()).toBeVisible()
  await shot(gerwyn.page, 'lobby/lobby-member-phone.png')

  await admin.page.reload()
  await expect(people(admin.page).getByText('Gerwyn').first()).toBeVisible()
  await shot(admin.page, 'lobby/lobby-host-desktop.png')
  {
    const phone = await open(browser, 'admin', VIEW.phone)
    await phone.page.goto('/#/lobby')
    await expect(people(phone.page).getByText('Gerwyn').first()).toBeVisible()
    await shot(phone.page, 'lobby/lobby-host-phone.png')
    await phone.ctx.close()
  }

  // Gerwyn's Play page while he's in the lobby: the nav shows where he is
  {
    const desk = await open(browser, 'gerwyn', VIEW.wide)
    await desk.page.goto('/#/')
    await expect(desk.page.locator('main').getByRole('button', { name: /^X01:/ })).toBeVisible()
    await shot(desk.page, 'lobby/indicator-desktop.png')
    await desk.ctx.close()
  }

  // Luke opens the join link
  {
    const luke = await open(browser, 'luke', VIEW.phone)
    await leaveLobby(luke.page) // out of the seed's lobby, so no lobby bar
    await luke.page.goto(`/#/join/${lobby.code}`)
    await expect(luke.page.getByText('Friday Night Darts').first()).toBeVisible()
    await shot(luke.page, 'lobby/join-phone.png')
    await luke.ctx.close()
  }

  // Start with the Dev Board offline
  await admin.page.getByRole('button', { name: /^Start/ }).click()
  await expect(admin.page.getByRole('dialog')).toBeVisible()
  await shot(admin.page, 'lobby/start-problem.png')
  await admin.page.keyboard.press('Escape')

  await leaveLobby(admin.page)
  for (const s of [admin, gerwyn, michael]) await s.ctx.close()
})

test('a lobby on its own, and its QR code', async ({ browser }) => {
  const admin = await open(browser, 'admin', VIEW.phone)
  await hostLobby(admin.page, "Admin's lobby", X01())
  await admin.page.goto('/#/lobby')
  await expect(people(admin.page).getByRole('button', { name: /^Start/ })).toBeVisible()
  await shot(admin.page, 'lobby/lobby-solo-phone.png')
  await leaveLobby(admin.page)
  await admin.ctx.close()

  for (const [view, file] of [
    [VIEW.phone, 'lobby/qr-sheet-phone.png'],
    [VIEW.smallPhone, 'lobby/qr-sheet-small-phone.png'],
  ] as const) {
    const phil = await open(browser, 'phil', view)
    await hostLobby(phil.page, "Phil's lobby", X01())
    await phil.page.goto('/#/lobby')
    await phil.page.getByRole('button', { name: 'Show the QR code' }).first().click()
    await expect(
      phil.page.getByRole('img', { name: 'QR code of the join link' }).or(phil.page.getByLabel('QR code of the join link')),
    ).toBeVisible()
    await shot(phil.page, file)
    await leaveLobby(phil.page)
    await phil.ctx.close()
  }
})

test("Gerwyn's lobby on a tablet", async ({ browser }) => {
  const gerwyn = await open(browser, 'gerwyn', VIEW.tablet)
  const michael = await open(browser, 'michael', VIEW.phone)
  const lobby = await hostLobby(gerwyn.page, 'Friday darts', X01())
  await joinLobby(michael.page, lobby)
  await michael.page.goto('/#/lobby')
  await gerwyn.page.goto('/#/lobby')
  await expect(people(gerwyn.page).getByText('Michael').first()).toBeVisible()
  await shot(gerwyn.page, 'tablet/lobby-Gerwyn-1180x820.png')
  await leaveLobby(gerwyn.page)
  await gerwyn.ctx.close()
  await michael.ctx.close()
})

test('teams in the lobby', async ({ browser }) => {
  const phil = await open(browser, 'phil', VIEW.desktopTall)
  const michael = await open(browser, 'michael', VIEW.phone)
  const luke = await open(browser, 'luke', VIEW.phone)
  const lobby = await hostLobby(phil.page, 'Doubles', X01({ format: 'teams' }))
  // Lobby order Michael, Sarah, Phil, Luke: teams alternate, so Michael + Phil vs Sarah + Luke
  await joinLobby(michael.page, lobby)
  await addGuest(phil.page, lobby, 'Sarah')
  // Phil to third place: moved below Michael and Sarah
  await joinLobby(luke.page, lobby)
  for (const s of [michael, luke]) await s.page.goto('/#/lobby')

  await phil.page.goto('/#/lobby')
  await expect(phil.page.getByRole('group', { name: 'Team A' })).toBeVisible()
  await shot(phil.page, 'teams/lobby-host-desktop.png')

  await expect(luke.page.getByRole('group', { name: 'Team A' })).toBeVisible()
  await luke.page.getByRole('group', { name: 'Team A' }).scrollIntoViewIfNeeded()
  await shot(luke.page, 'teams/lobby-member-phone.png')

  // Mid-drag: Luke picked up from his team, held over the other one
  const dragShot = async (page: Page, file: string) => {
    const inA = (await page.getByRole('group', { name: 'Team A' }).getByText('Luke', { exact: true }).count()) > 0
    const row = page.locator('[role=group][aria-label^="Team"] [data-sortable-id]', { hasText: 'Luke' })
    const target = page.getByRole('group', { name: inA ? 'Team B' : 'Team A' })
    await row.scrollIntoViewIfNeeded()
    const from = (await row.boundingBox())!
    const to = (await target.boundingBox())!
    await page.mouse.move(from.x + 20, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + 30, from.y + from.height / 2 - 10, { steps: 4 })
    await page.mouse.move(to.x + 30, to.y + to.height - 30, { steps: 12 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: docPath(file), animations: 'allow' })
    // Dropped back where it came from: the teams stay as they were
    await page.mouse.move(from.x + 20, from.y + from.height / 2, { steps: 12 })
    await page.mouse.up()
  }
  await dragShot(phil.page, 'teams/lobby-drag-desktop.png')
  {
    const phone = await open(browser, 'phil', VIEW.phone)
    await phone.page.goto('/#/lobby')
    await expect(phone.page.getByRole('group', { name: 'Team A' })).toBeVisible()
    await dragShot(phone.page, 'teams/lobby-drag-phone.png')
    await phone.ctx.close()
  }

  // Uneven: three against one
  await phil.page.reload()
  await expect(phil.page.getByRole('group', { name: 'Team A' })).toBeVisible()
  const lukeInA = (await phil.page.getByRole('group', { name: 'Team A' }).getByText('Luke', { exact: true }).count()) > 0
  await phil.page.getByRole('button', { name: lukeInA ? 'Move Sarah to Team A' : 'Move Luke to Team A' }).click()
  await expect(phil.page.getByText(/Teams are uneven/)).toBeVisible()
  await shot(phil.page, 'teams/lobby-uneven-desktop.png')

  await leaveLobby(phil.page)
  for (const s of [phil, michael, luke]) await s.ctx.close()
})

test('bots in a lobby and in a match', async ({ browser }) => {
  const michael = await open(browser, 'michael', VIEW.wide)
  const lobby = await hostLobby(michael.page, "Michael's lobby", X01({ firstTo: 2 }))
  await addBot(michael.page, lobby, 3)
  await addBot(michael.page, lobby, 8)
  await michael.page.goto('/#/lobby')
  await expect(people(michael.page).getByText('Level 8').first()).toBeVisible()
  await shot(michael.page, 'bots/lobby-bots-desktop.png')
  {
    const phone = await open(browser, 'michael', VIEW.phone)
    await phone.page.goto('/#/lobby')
    await expect(people(phone.page).getByText('Level 8').first()).toBeVisible()
    await shot(phone.page, 'bots/lobby-bots-phone.png')
    await phone.ctx.close()
  }

  // A duel against the level 8 bot: Michael throws, then the bot answers
  const duel = await hostLobby(michael.page, "Michael's lobby", X01({ firstTo: 2 }))
  await addBot(michael.page, duel, 8)
  await startLobbyGame(michael.page, duel)
  for (const d of ['T20', 'S20', 'T20']) await dart(michael.page, d)
  await michael.page.getByRole('button', { name: 'Next player' }).click()
  // The bot throws its visit, and it's Michael's turn again
  await expect(michael.page.getByText('Michael').first()).toBeVisible()
  await michael.page.waitForTimeout(9000)
  for (const d of ['T19', 'T19', 'S19']) await dart(michael.page, d)
  await michael.page.getByRole('button', { name: 'Next player' }).click()
  await michael.page.waitForTimeout(7000)
  await shot(michael.page, 'bots/match-bot-desktop.png')
  await endGame(michael.page)
  await leaveLobby(michael.page)
  await michael.ctx.close()
})
