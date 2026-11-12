import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { open, hostLobby, leaveLobby, addGuest, X01, startLobbyGame, openHash, endGame, entryMode, dart, shot } from './helpers.js'
import type { View } from './helpers.js'

// "Report a bug" on every screen: the labelled button above the side nav's account row, the icon in the
// tablet rail and in the phone and game headers; docs/bug-report-button/<size>-<scene>.png

const SIZES = {
  desktop: { width: 1440, height: 900, scale: 1 },
  tablet: { width: 820, height: 1180, scale: 1 },
  phone: { width: 390, height: 844, scale: 2 },
  'phone-small': { width: 320, height: 640, scale: 2 },
  'phone-landscape': { width: 844, height: 390, scale: 2 },
} satisfies Record<string, View>
type Size = keyof typeof SIZES
const SIZE_NAMES = Object.keys(SIZES) as Size[]

/** The same game (or page) at every size, signed in as Phil, shot as bug-report-button/<size>-<scene>.png. */
async function atEverySize(
  browser: Browser,
  scene: string,
  hash: string,
  prepare: (page: Page) => Promise<void> = async () => undefined,
): Promise<void> {
  for (const name of SIZE_NAMES) {
    const { ctx, page } = await open(browser, 'phil', SIZES[name])
    await openHash(page, hash)
    await expect(page.getByRole('button', { name: 'Report a bug' }).locator('visible=true').first()).toBeVisible()
    await prepare(page)
    await shot(page, `bug-report-button/${name}-${scene}.png`, { settle: scene === 'minigolf' ? 3000 : 600 })
    await ctx.close()
  }
}

async function game(browser: Browser, scene: string, host: Page, sessionId: string, prepare?: (page: Page) => Promise<void>) {
  await atEverySize(browser, scene, `/session/${sessionId}`, prepare)
  await endGame(host)
  await leaveLobby(host)
}

test('on a page, and the dialog it opens', async ({ browser }) => {
  await atEverySize(browser, 'home', '/')
  for (const name of ['desktop', 'phone'] as const) {
    const { ctx, page } = await open(browser, 'phil', SIZES[name])
    await openHash(page, '/')
    await page.getByRole('button', { name: 'Report a bug' }).locator('visible=true').first().click()
    // The screenshot of the page is taken before the dialog opens
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 })
    await shot(page, `bug-report-button/${name}-dialog.png`, { keepToasts: true })
    await ctx.close()
  }
})

test('a game: solo, duel and a party of four', async ({ browser }) => {
  test.setTimeout(300_000)
  const phil = await open(browser, 'phil', SIZES.desktop)
  for (const [scene, guests] of [
    ['x01-solo', []],
    ['x01-duel', ['Anna']],
    ['x01-party', ['Anna', 'Ben', 'Cleo']],
  ] as const) {
    const lobby = await hostLobby(phil.page, "Phil's lobby", X01())
    for (const g of guests) await addGuest(phil.page, lobby, g)
    const session = await startLobbyGame(phil.page, lobby)
    await entryMode(phil.page, 'Enter')
    for (const d of ['T20', 'T20', 'S20']) await dart(phil.page, d)
    await game(browser, scene, phil.page, session)
  }
  await phil.ctx.close()
})

test('a team game', async ({ browser }) => {
  const phil = await open(browser, 'phil', SIZES.desktop)
  const lobby = await hostLobby(phil.page, 'Doubles', X01({ format: 'teams' }))
  for (const g of ['Sarah', 'Anna', 'Ben']) await addGuest(phil.page, lobby, g)
  const session = await startLobbyGame(phil.page, lobby)
  await game(browser, 'x01-teams', phil.page, session)
  await phil.ctx.close()
})

test('a bull off, and the win screen', async ({ browser }) => {
  const phil = await open(browser, 'phil', SIZES.desktop)
  let lobby = await hostLobby(phil.page, "Phil's lobby", X01({ bullOff: 'on' }))
  await addGuest(phil.page, lobby, 'Anna')
  let session = await startLobbyGame(phil.page, lobby)
  await game(browser, 'bull-off', phil.page, session)

  lobby = await hostLobby(phil.page, "Phil's lobby", X01({ startScore: 21, firstTo: 1, outMode: 'straight' }))
  await addGuest(phil.page, lobby, 'Anna')
  session = await startLobbyGame(phil.page, lobby)
  await entryMode(phil.page, 'Enter')
  await dart(phil.page, 'T7')
  await phil.page.getByRole('button', { name: 'Finish game' }).click()
  await expect(phil.page.getByText('MATCH OVER')).toBeVisible({ timeout: 15_000 })
  await atEverySize(browser, 'win', `/session/${session}`)
  await leaveLobby(phil.page)
  await phil.ctx.close()
})

test('cricket and minigolf', async ({ browser }) => {
  test.setTimeout(300_000)
  const phil = await open(browser, 'phil', SIZES.desktop)
  for (const gameId of ['cricket', 'minigolf']) {
    const lobby = await hostLobby(phil.page, "Phil's lobby", { gameId, config: {} })
    await addGuest(phil.page, lobby, 'Lena')
    const session = await startLobbyGame(phil.page, lobby)
    if (gameId === 'minigolf') await expect(phil.page.locator('[data-testid=hole-3d] canvas')).toBeVisible({ timeout: 40_000 })
    await game(browser, gameId, phil.page, session)
  }
  await phil.ctx.close()
})
