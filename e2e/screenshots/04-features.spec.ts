import { test, expect, type Locator } from '@playwright/test'
import { VIEW, X01, open, shot, hostLobby, leaveLobby, addGuest, startLobbyGame, endGame, dart, entryMode, openHash } from './helpers.js'
import { makeZip } from '../../backend/src/caller/zipFixture.js'
import { makeMp3 } from '../../backend/src/caller/mp3Fixture.js'

// The features that shipped after the first screenshots: Minigolf, 121, match details, matchmaking, the caller

/** A player's profile card, opened from the keyboard on their first visible name in `within`. */
async function openProfile(within: Locator, name: string): Promise<void> {
  const trigger = within
    .getByRole('button', { name: `${name}: profile` })
    .filter({ visible: true })
    .first()
  await trigger.focus()
  await trigger.press('Enter')
  await expect(within.page().getByRole('dialog').getByRole('link', { name: 'Profile' })).toBeVisible()
}

test('minigolf: a hole in 3D, and the course editor', async ({ browser }) => {
  test.setTimeout(300_000)
  // Phil (no board: manual entry) and his guest Lena, on the official course
  const phil = await open(browser, 'phil', VIEW.wide)
  const lobby = await hostLobby(phil.page, "Phil's lobby", { gameId: 'minigolf', config: {} })
  await addGuest(phil.page, lobby, 'Lena')
  const session = await startLobbyGame(phil.page, lobby)
  await expect(phil.page.locator('[data-testid=hole-3d] canvas')).toBeVisible({ timeout: 30_000 })

  // Phil putts: a dart in the 20, halfway out; shot, rolled, and Lena is up
  const board = phil.page.locator('[aria-label="Dartboard"]')
  const box = (await board.boundingBox())!
  await phil.page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3)
  await expect(phil.page.getByLabel('Tries')).toContainText('S20')
  await phil.page.getByRole('button', { name: 'Shoot' }).click()
  await expect(phil.page.getByTestId('minigolf-player').nth(1)).toContainText('Putting', { timeout: 40_000 })
  // Lena aims: a dart in the 5, near the treble ring
  await phil.page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.25)
  await phil.page.waitForTimeout(1500)
  await shot(phil.page, 'minigolf/hole-3d-desktop.png', { settle: 2500 })

  const phone = await open(browser, 'phil', VIEW.phone)
  await openHash(phone.page, `/session/${session}`)
  await expect(phone.page.locator('[data-testid=hole-3d] canvas')).toBeVisible({ timeout: 30_000 })
  await shot(phone.page, 'minigolf/hole-3d-phone.png', { settle: 4000 })
  await phone.ctx.close()

  await endGame(phil.page)
  await leaveLobby(phil.page)
  await phil.ctx.close()

  const admin = await open(browser, 'admin', VIEW.wide)

  // The course editor: the official course, then its third hole (Summit: slopes)
  await admin.page.goto('/#/admin/minigolf/courses')
  await admin.page
    .getByRole('link', { name: /holes · par/ })
    .first()
    .click()
  await admin.page.waitForURL(/\/admin\/minigolf\/courses\/[^/]+$/)
  await shot(admin.page, 'minigolf/course-editor-desktop.png', { settle: 2000 })
  await admin.page.getByRole('link', { name: 'Edit', exact: true }).nth(2).click()
  await admin.page.waitForURL(/\/admin\/minigolf\/holes\//)
  await expect(admin.page.locator('[aria-label="Hole canvas"]')).toBeVisible({ timeout: 20_000 })
  await shot(admin.page, 'minigolf/hole-editor-desktop.png', { settle: 3000 })
  await admin.ctx.close()
})

test('121: a game in progress', async ({ browser }) => {
  const phil = await open(browser, 'phil', VIEW.wide)
  const lobby = await hostLobby(phil.page, "Phil's lobby", { gameId: 'p121', config: {} })
  const session = await startLobbyGame(phil.page, lobby)
  await entryMode(phil.page, 'Enter')
  // Try 1: T20, T11, D14 checks out 121; try 2 at 122 starts with T20
  for (const d of ['T20', 'T11', 'D14']) await dart(phil.page, d)
  await phil.page.getByRole('button', { name: 'Next: 122' }).click()
  for (const d of ['T20', 'S20']) await dart(phil.page, d)
  await shot(phil.page, 'p121/game-desktop.png')

  const phone = await open(browser, 'phil', VIEW.phone)
  await openHash(phone.page, `/session/${session}`)
  await entryMode(phone.page, 'Enter')
  await expect(phone.page.locator('section[aria-label^="Target 122,"]').first()).toBeVisible()
  await shot(phone.page, 'p121/game-phone.png')
  await phone.ctx.close()

  await endGame(phil.page)
  await leaveLobby(phil.page)
  await phil.ctx.close()
})

test('match details: stats, charts and the heatmap', async ({ browser }) => {
  // The seed's best-of-3 between Michael and Gerwyn: darts thrown like bots, with positions
  for (const [view, suffix] of [
    [VIEW.wide, 'desktop'],
    [VIEW.phone, 'phone'],
  ] as const) {
    const { ctx, page } = await open(browser, 'michael', view)
    await page.goto('/#/history')
    // The row's corner: its middle may be a player's profile button
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Gerwyn' })
      .first()
      .getByRole('link', { name: /X01.*details/ })
      .click({ position: { x: 8, y: 8 } })
    await page.waitForURL(url => url.hash.startsWith('#/history/'))
    await expect(page.getByRole('tab', { name: 'Heatmap' })).toBeVisible()
    await shot(page, `details/x01-stats-${suffix}.png`, { settle: 1500 })
    await openProfile(page.getByRole('region', { name: 'Result', exact: true }), 'Gerwyn')
    await shot(page, `details/x01-profile-${suffix}.png`)
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Heatmap' }).click()
    await expect(page.getByText('Where every dart landed')).toBeVisible()
    // On a phone the heatmap sits below the stats: bring it to the top
    await page.getByRole('tab', { name: 'Heatmap' }).evaluate(el => el.scrollIntoView({ block: 'start' }))
    await shot(page, `details/x01-heatmap-${suffix}.png`, { settle: 1500 })
    await ctx.close()
  }
})

test('history: compact stats on a phone, the page scrolled', async ({ browser }) => {
  for (const [view, suffix] of [
    [VIEW.wide, 'desktop'],
    [VIEW.phone, 'phone'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/history')
    await expect(page.getByRole('link', { name: /details/ }).first()).toBeVisible()
    await shot(page, `history/history-${suffix}.png`)
    await openProfile(page.locator('main'), 'Luke')
    await shot(page, `history/history-profile-${suffix}.png`)
    await page.keyboard.press('Escape')
    if (suffix === 'phone') {
      await page
        .getByRole('link', { name: /details/ })
        .last()
        .scrollIntoViewIfNeeded()
      await shot(page, 'history/history-phone-scrolled.png')
    }
    await ctx.close()
  }
})

test('matchmaking and ranks', async ({ browser }) => {
  for (const [view, route, file] of [
    [VIEW.wide, '/matchmaking', 'matchmaking/matchmaking-desktop.png'],
    [VIEW.phone, '/matchmaking', 'matchmaking/matchmaking-phone.png'],
    [VIEW.wide, '/matchmaking/ranks', 'matchmaking/ranks-desktop.png'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto(`/#${route}`)
    await expect(page.getByRole('heading', { name: /Matchmaking|Ranks/ }).first()).toBeVisible()
    await shot(page, file)
    await ctx.close()
  }
})

test('the caller: settings, voices, checkout calls and the Autodarts guide, in-game drawer', async ({ browser }) => {
  // A small voice pack: the numbers and the usual calls, as tiny mp3s (each different: identical clips are kept once)
  const keys = [...Array.from({ length: 181 }, (_, i) => String(i)), 'gameshot', 'busted', 'require_121']
  const zip = makeZip(keys.map((k, i) => ({ name: `${k}.mp3`, data: makeMp3({ frames: 8 + i }), method: 0 })))

  const desk = await open(browser, 'phil', VIEW.desktopTall)
  await desk.page.goto('/#/settings/caller')
  await desk.page.locator('#v-zip').setInputFiles({ name: 'Studio Caller (en).zip', mimeType: 'application/zip', buffer: Buffer.from(zip) })
  await expect(desk.page.getByText(/Kept \d+ of/).first()).toBeVisible({ timeout: 30_000 })
  await shot(desk.page, 'caller/link-import.png')
  await desk.page.reload()
  await expect(desk.page.getByText('Studio Caller').first()).toBeVisible()
  await shot(desk.page, 'caller/settings-desktop.png')

  // The caller on: its checkout calls show, and the Import Autodarts voices guide under the zip drop
  const callerSwitch = desk.page.getByRole('switch', { name: /^Caller/ }).first()
  if ((await callerSwitch.getAttribute('aria-checked')) !== 'true') await callerSwitch.click()
  await expect(desk.page.getByText('Checkout calls').first()).toBeVisible()
  await desk.page.setViewportSize({ width: VIEW.wide.width, height: VIEW.wide.height })
  await shot(desk.page, 'caller/checkout-calls-desktop.png')

  await desk.ctx.close()

  const phone = await open(browser, 'phil', VIEW.phone)
  await phone.page.goto('/#/settings/caller')
  await expect(phone.page.getByText('Studio Caller').first()).toBeVisible()
  await shot(phone.page, 'caller/settings-phone.png')
  await phone.ctx.close()

  // In a game: the settings drawer, after a 180
  const game = await open(browser, 'phil', VIEW.desktop)
  const lobby = await hostLobby(game.page, 'Doubles', { gameId: 'x01', config: { startScore: 501, firstTo: 2 } })
  await addGuest(game.page, lobby, 'Sarah')
  await startLobbyGame(game.page, lobby)
  await entryMode(game.page, 'Enter')
  for (const d of ['T20', 'T20', 'T20']) await dart(game.page, d)
  await game.page.getByRole('button', { name: 'Game settings' }).click()
  const drawer = game.page.getByRole('dialog')
  await drawer
    .getByText(/^Caller$/i)
    .first()
    .scrollIntoViewIfNeeded()
  await shot(game.page, 'caller/drawer-caller.png', { settle: 1200 })
  await game.page.keyboard.press('Escape')
  await endGame(game.page)
  await leaveLobby(game.page)
  await game.ctx.close()
})

test('the in-game settings drawer follows the game: Around the Clock and X01', async ({ browser }) => {
  const game = await open(browser, 'phil', VIEW.desktop)
  const atc = { gameId: 'atc', config: { throwAgainOnAllHit: false, finishOn: 'single_bull', multiplierAdvances: false, order: 'asc' } }
  for (const [nextGame, file] of [
    [atc, 'atc'],
    [X01(), 'x01'],
  ] as const) {
    const lobby = await hostLobby(game.page, 'Settings', nextGame)
    await addGuest(game.page, lobby, 'Sarah')
    await startLobbyGame(game.page, lobby)
    await game.page.getByRole('button', { name: 'Game settings' }).click()
    await expect(game.page.getByRole('dialog').getByText('Sound effects')).toBeVisible()
    await shot(game.page, `settings-drawer/${file}.png`, { settle: 800 })
    await game.page.keyboard.press('Escape')
    await endGame(game.page)
    await leaveLobby(game.page)
  }
  await game.ctx.close()
})
