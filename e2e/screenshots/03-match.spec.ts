import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import {
  VIEW,
  open,
  shot,
  hostLobby,
  joinLobby,
  leaveLobby,
  addGuest,
  X01,
  startLobbyGame,
  endGame,
  dart,
  entryMode,
  openHash,
  type Who,
} from './helpers.js'

/** One visit on this page: its darts, then Next player (unless it's the visit still being thrown). */
async function visit(page: Page, darts: string[], done = true): Promise<void> {
  for (const d of darts) await dart(page, d)
  if (done) await page.getByRole('button', { name: 'Next player' }).click()
}

/** The game upright, with the board: on a tablet (820×1180) and on a monitor on its side (1080×1920). */
async function portraitShots(browser: Browser, who: Who, session: string, file: string, name: string): Promise<void> {
  for (const view of [VIEW.tabletPortrait, VIEW.monitorPortrait]) {
    const s = await open(browser, who, view)
    await s.page.goto(`/#/session/${session}`)
    await expect(s.page.getByText(name).first()).toBeVisible()
    await entryMode(s.page, 'Board')
    await expect(s.page.getByRole('button', { name: 'Treble', exact: true })).toHaveCount(0)
    await shot(s.page, `portrait/${file}-${view.width}x${view.height}.png`)
    await s.ctx.close()
  }
}

test('a duel on a tablet: board and keypad', async ({ browser }) => {
  const luke = await open(browser, 'luke', VIEW.tablet)
  const lobby = await hostLobby(luke.page, "Luke's lobby", X01())
  await addGuest(luke.page, lobby, 'Anna')
  const session = await startLobbyGame(luke.page, lobby)
  await entryMode(luke.page, 'Enter')
  // Luke 180, 125, 100 (96 left); Anna 100, 77, 83; then Luke's T20 leaves 36 for D18
  await visit(luke.page, ['T20', 'T20', 'T20'])
  await visit(luke.page, ['T20', 'S20', 'S20'])
  await visit(luke.page, ['T20', 'T20', 'S5'])
  await visit(luke.page, ['T19', 'S19', 'S1'])
  await visit(luke.page, ['T20', 'S20', 'S20'])
  await visit(luke.page, ['T20', 'S20', 'S3'])
  await visit(luke.page, ['T20'], false)

  await entryMode(luke.page, 'Board')
  await shot(luke.page, 'tablet/match-duel-board-1180x820.png')

  await portraitShots(browser, 'luke', session, 'x01-duel', 'Anna')

  await endGame(luke.page)
  await leaveLobby(luke.page)
  await luke.ctx.close()
})

test('a party of four on a tablet', async ({ browser }) => {
  const phil = await open(browser, 'phil', VIEW.tablet)
  const lobby = await hostLobby(phil.page, "Phil's lobby", X01())
  for (const g of ['Lena', 'Max', 'Sophie']) await addGuest(phil.page, lobby, g)
  const session = await startLobbyGame(phil.page, lobby)
  await entryMode(phil.page, 'Enter')
  await visit(phil.page, ['T20', 'T20', 'T20'])
  await visit(phil.page, ['T20', 'T20', 'S1'])
  await visit(phil.page, ['T20', 'T20', 'S20'])
  await visit(phil.page, ['S20', 'S5', 'S1'])
  await visit(phil.page, ['T20', 'S20', 'S5'])
  await visit(phil.page, ['T20'], false)
  await shot(phil.page, 'tablet/match-party-1180x820.png')

  const small = await open(browser, 'phil', VIEW.tablet1024)
  await small.page.goto(`/#/session/${session}`)
  await entryMode(small.page, 'Enter')
  await expect(small.page.getByText('Sophie').first()).toBeVisible()
  await shot(small.page, 'tablet/match-party-1024x768.png')
  await small.ctx.close()
  await portraitShots(browser, 'phil', session, 'x01-party', 'Sophie')

  await endGame(phil.page)
  await leaveLobby(phil.page)
  await phil.ctx.close()
})

test('around the clock upright', async ({ browser }) => {
  const michael = await open(browser, 'michael', VIEW.tablet)
  const lobby = await hostLobby(michael.page, "Michael's lobby", {
    gameId: 'atc',
    config: { throwAgainOnAllHit: false, finishOn: 'single_bull', multiplierAdvances: false, order: 'asc' },
  })
  await addGuest(michael.page, lobby, 'Anna')
  const session = await startLobbyGame(michael.page, lobby)
  await entryMode(michael.page, 'Enter')
  await visit(michael.page, ['S1', 'S2', 'S3'])
  await visit(michael.page, ['S1', 'MISS', 'S2'])
  await visit(michael.page, ['S4', 'S5', 'MISS'])
  await visit(michael.page, ['S3', 'S4', 'S5'])
  await visit(michael.page, ['S6'], false)
  await portraitShots(browser, 'michael', session, 'atc-duel', 'Anna')
  await endGame(michael.page)
  await leaveLobby(michael.page)
  await michael.ctx.close()
})

test('a remote game waiting for a player', async ({ browser }) => {
  const gerwyn = await open(browser, 'gerwyn', VIEW.tablet1024Short)
  const michael = await open(browser, 'michael', VIEW.phone)
  const lobby = await hostLobby(gerwyn.page, 'Friday darts', X01())
  await joinLobby(michael.page, lobby)
  // Michael never opens the game: his seat waits for him
  await michael.ctx.close()
  await startLobbyGame(gerwyn.page, lobby)
  await visit(gerwyn.page, ['T20', 'T20', 'T20'])
  await expect(gerwyn.page.getByText(/Waiting for Michael/i).first()).toBeVisible({ timeout: 20_000 })
  await shot(gerwyn.page, 'tablet/remote-waiting-1024x730.png')
  await endGame(gerwyn.page)
  await leaveLobby(gerwyn.page)
  await gerwyn.ctx.close()
})

test('teams: 2v2 and 2v1 matches', async ({ browser }) => {
  const phil = await open(browser, 'phil', VIEW.desktop)
  const michael = await open(browser, 'michael', VIEW.desktop)
  const luke = await open(browser, 'luke', VIEW.desktop)
  // Lobby order Phil, Michael, Sarah, Luke: Team A Phil + Sarah, Team B Michael + Luke; they throw A, B, A, B
  let lobby = await hostLobby(phil.page, 'Doubles', X01({ format: 'teams' }))
  await joinLobby(michael.page, lobby)
  await addGuest(phil.page, lobby, 'Sarah')
  await joinLobby(luke.page, lobby)
  let session = await startLobbyGame(phil.page, lobby)
  for (const s of [michael, luke]) await openHash(s.page, `/session/${session}`)
  for (const s of [phil, michael, luke]) await entryMode(s.page, 'Enter')
  await visit(phil.page, ['T20', 'T20', 'S20'])
  await visit(michael.page, ['T20', 'T17', 'T20'])
  await visit(phil.page, ['S20', 'S5', 'S1'])
  await visit(luke.page, ['T20', 'S20', 'S20'])
  await visit(phil.page, ['T20'], false)
  await shot(phil.page, 'teams/match-2v2-desktop.png')
  {
    const phone = await open(browser, 'phil', VIEW.phone)
    await phone.page.goto(`/#/session/${session}`)
    await entryMode(phone.page, 'Enter')
    await expect(phone.page.getByText('Sarah').first()).toBeVisible()
    await shot(phone.page, 'teams/match-2v2-phone.png')
    await phone.ctx.close()
  }
  await endGame(phil.page)

  // 101, one against two: Phil alone on Team A
  await phil.page.setViewportSize({ width: VIEW.narrow.width, height: VIEW.narrow.height })
  lobby = await hostLobby(phil.page, 'Doubles', X01({ format: 'teams', startScore: 101, firstTo: 1 }))
  await joinLobby(luke.page, lobby)
  await joinLobby(michael.page, lobby)
  await openHash(phil.page, '/lobby')
  await expect(phil.page.locator('[role=group][aria-label^="Team"]').getByText('Michael', { exact: true })).toBeVisible()
  const michaelInA = (await phil.page.getByRole('group', { name: 'Team A' }).getByText('Michael', { exact: true }).count()) > 0
  if (michaelInA) await phil.page.getByRole('button', { name: 'Move Michael to Team B' }).click()
  await expect(phil.page.getByRole('group', { name: 'Team B' }).getByText('Michael', { exact: true })).toBeVisible()
  session = await startLobbyGame(phil.page, lobby)
  for (const s of [michael, luke]) await openHash(s.page, `/session/${session}`)
  for (const s of [phil, michael, luke]) await entryMode(s.page, 'Enter')
  // A: Phil, B: Luke, A: Phil, B: Michael
  await visit(phil.page, ['S20', 'S1', 'S1'])
  await visit(luke.page, ['S20', 'S5', 'S1'])
  await expect(phil.page.getByText(/T19/).first()).toBeVisible()
  await shot(phil.page, 'teams/match-2v1-narrow.png')

  await phil.page.setViewportSize({ width: VIEW.desktop.width, height: VIEW.desktop.height })
  await visit(phil.page, ['T19', 'D11'], false)
  await phil.page.getByRole('button', { name: 'Finish game' }).click()
  await expect(phil.page.getByRole('region', { name: 'Team A wins' })).toBeVisible({ timeout: 15_000 })
  await shot(phil.page, 'teams/match-win.png')

  await leaveLobby(phil.page)
  for (const s of [phil, michael, luke]) await s.ctx.close()
})
