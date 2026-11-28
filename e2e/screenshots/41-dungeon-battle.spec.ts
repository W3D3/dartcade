import { test, expect, type Page } from '@playwright/test'
import { VIEW, addGuest, dart, entryMode, hostLobby, leaveLobby, endActiveGames, open, shot, startLobbyGame } from './helpers.js'

// Dungeon's in-run screens (behind gamemode.dungeon.enabled, on for admins): a two-hero run played
// through from the keypad (battle, the resolved visit, the enemy turn, treasure, rest, event, the boss,
// victory, the boss's entrance and the damage popup), one lost run, the correction popover on the battle screen, and no sideways scrolling.
const easy = { gameId: 'dungeon', config: { difficulty: 'easy', floors: 5 } }
const expert = { gameId: 'dungeon', config: { difficulty: 'expert', floors: 5 } }
const SCREENS = [
  'dungeon-battle',
  'dungeon-treasure',
  'dungeon-rest',
  'dungeon-event',
  'dungeon-end',
  'dungeon-summary',
  'dungeon-map',
] as const
type Screen = (typeof SCREENS)[number]
// The screens rebuilt to the artboards: their shots sit beside the artboards in docs/dungeon-polish
const POLISHED = new Set(['battle', 'boss', 'boss-intro', 'battle-popup-playing', 'battle-enemy-turn'])

async function screen(page: Page): Promise<Screen> {
  const any = page.locator(SCREENS.map(id => `[data-testid="${id}"]`).join(','))
  await expect(any.first()).toBeVisible()
  return (await any.first().getAttribute('data-testid')) as Screen
}

const next = (page: Page) =>
  page
    .getByRole('button', { name: /Next|Finish/ })
    .first()
    .click()

async function startRun(page: Page, name: string, cfg: typeof easy): Promise<void> {
  // A dropped game socket locks the keypad: say when and why, so a stalled run explains itself
  page.on('console', m => m.type() === 'error' && console.log(`[${name}] console: ${m.text()}`))
  page.on('websocket', ws => ws.on('close', () => console.log(`[${name}] socket closed: ${ws.url()}`)))
  const lobby = await hostLobby(page, "Admin's dungeon", cfg)
  await addGuest(page, lobby, 'Lena')
  await startLobbyGame(page, lobby)
  await page
    .locator('[data-class="brawler"]')
    .getByRole('button', { name: /^Pick for/ })
    .click()
  await expect(page.getByText('Pick for Lena').first()).toBeVisible()
  await page
    .locator('[data-class="archer"]')
    .getByRole('button', { name: /^Pick for/ })
    .click()
  await page.getByRole('button', { name: 'Start run' }).click()
  const keypad = page.getByRole('button', { name: 'Enter darts by number' })
  if (name === 'phone' && (await keypad.isVisible())) await keypad.click()
  else await entryMode(page, 'Enter')
}

// Each hero votes for the side whose room this run hasn't seen yet (a fight otherwise)
async function vote(page: Page, seen: Set<string>): Promise<void> {
  const map = page.getByTestId('dungeon-map')
  const cards = page.locator('[data-side]').filter({ visible: true })
  const rooms = await Promise.all(
    (await cards.all()).map(async c => ({ side: await c.getAttribute('data-side'), type: ((await c.textContent()) ?? '').toLowerCase() })),
  )
  const want = rooms.find(r => ['treasure', 'rest', 'event'].some(t => r.type.includes(t) && !seen.has(t))) ?? rooms[0]
  // Every living hero votes (a downed one doesn't); the last vote's Next enters the room, and a
  // floor with one room is entered without a vote, so the map never follows the map
  for (let hero = 0; hero < 2 && (await map.isVisible()); hero++) {
    await cards.and(page.locator(`[data-side="${want?.side ?? 'left'}"]`)).click()
    await next(page)
    await page.waitForTimeout(500)
  }
  await expect(map).toBeHidden()
}

// A choice screen's button, if it is still there (the next screen may already be on its way)
async function press(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name, exact: true }).first()
  if (await button.isVisible()) await button.click()
  else await page.waitForTimeout(200)
}

// `aim` is each fight's visit; with none, the host's DEV button resolves the fight instead
async function play(
  page: Page,
  name: string | null,
  aim: string[],
  until: (s: Screen, seen: Set<string>) => boolean,
  seen = new Set<string>(),
): Promise<Set<string>> {
  const once = async (key: string, file: string) => {
    if (seen.has(key)) return
    seen.add(key)
    if (name) await shot(page, `${POLISHED.has(file) ? 'dungeon-polish/app-' : 'dungeon/'}${file}-${name}.png`)
  }
  let previous: Screen | null = null
  for (let step = 0; step < 400; step++) {
    const s = await screen(page)
    if (until(s, seen)) return seen
    // The outcome shows on the map that follows the event, until the party enters a room
    if (s === 'dungeon-map' && previous === 'dungeon-event') await expect(page.getByTestId('event-outcome').first()).toBeVisible()
    previous = s
    if (s === 'dungeon-map') {
      await vote(page, seen)
    } else if (s === 'dungeon-battle' && aim.length === 0) {
      await press(page, 'DEV: resolve this room')
    } else if (s === 'dungeon-battle') {
      // The boss fight opens behind its entrance until Fight
      const intro = page.getByTestId('dungeon-boss')
      if (await intro.isVisible()) {
        await once('boss-intro', 'boss-intro')
        await page.getByRole('button', { name: 'Fight', exact: true }).click()
        await expect(intro).toBeHidden()
      }
      const boss = await page.getByText('Boss', { exact: true }).isVisible()
      await once(boss ? 'boss' : 'battle', boss ? 'boss' : 'battle')
      for (const label of aim) await dart(page, label)
      // The resolved visit plays as the damage popup; the board view keeps each dart's segment lit
      // (a visit that kills the boss ends the run at once: no popup)
      const popup = page.getByTestId('damage-popup')
      const still = (await screen(page)) === 'dungeon-battle'
      if (still) await expect(popup).toBeVisible()
      if (still && !boss && !seen.has('popup') && name && aim[0] !== 'MISS') {
        if (name === 'desktop') await entryMode(page, 'Board')
        await popup.scrollIntoViewIfNeeded()
        await page.waitForTimeout(1500)
        await once('popup', 'battle-popup-playing')
        await press(page, 'Tap anywhere to skip')
        await popup.scrollIntoViewIfNeeded()
        await expect(page.getByTestId('final-damage')).toHaveAttribute('data-fire', /[0-3]/)
        if (name === 'desktop') await expect(page.getByTestId('lit-segment').first()).toBeVisible()
        await shot(page, `dungeon-polish/app-battle-popup-${name}.png`)
        if (name === 'desktop') await entryMode(page, 'Enter')
      }
      if ((await screen(page)) === 'dungeon-battle') await next(page)
      if ((await screen(page)) === 'dungeon-battle' && (await page.getByTestId('enemy-turn').isVisible()))
        await once('enemy-turn', 'battle-enemy-turn')
    } else if (s === 'dungeon-treasure') {
      await once('treasure', 'treasure')
      await page.getByTestId('offer').first().click()
    } else if (s === 'dungeon-rest') {
      await once('rest', 'rest')
      const resting = page.getByText(/ throws · Heal/)
      const who = ((await resting.textContent()) ?? '').split(' throws')[0]
      for (const label of ['S5', 'S5', 'S5']) await dart(page, label)
      await next(page)
      // Wait for the next hero (or the map): a stale rest screen would take a dart the map has no keypad for
      await expect(page.getByText(`${who} throws · Heal`)).toBeHidden()
    } else if (s === 'dungeon-event') {
      await once('event', 'event')
      await page.getByTestId('decision').first().getByRole('button').click()
    } else {
      await next(page)
    }
  }
  throw new Error('the run did not end')
}

const VIEWS = [
  [VIEW.desktop, 'desktop'],
  [VIEW.phone, 'phone'],
] as const

for (const [view, name] of VIEWS) {
  test(`a run from the first fight to victory (${name})`, async ({ browser }) => {
    test.setTimeout(900_000)
    const { ctx, page } = await open(browser, 'admin', view)
    await endActiveGames(page)
    await leaveLobby(page)
    await startRun(page, name, easy)
    const seen = await play(page, name, ['T20', 'T20', 'T20'], s => s === 'dungeon-end' || s === 'dungeon-summary')
    expect([...seen]).toEqual(expect.arrayContaining(['battle', 'boss']))
    // Victory, then Finish; a run the server finished at once goes straight to the summary
    if (await page.getByTestId('dungeon-end').isVisible()) {
      await expect(page.getByRole('heading', { name: 'Victory' })).toBeVisible()
      await shot(page, `dungeon/victory-${name}.png`)
      await next(page)
    }
    await expect(page.getByTestId('dungeon-summary')).toBeVisible()
    await expect(page.getByText('Victory').first()).toBeVisible()
    await endActiveGames(page)
    await leaveLobby(page)
    await ctx.close()
  })
}

for (const [view, name] of VIEWS) {
  test(`a lost run (${name})`, async ({ browser }) => {
    test.setTimeout(600_000)
    const { ctx, page } = await open(browser, 'admin', view)
    await endActiveGames(page)
    await leaveLobby(page)
    await startRun(page, name, expert)
    // The phone's battle shots come from this run; the desktop ones from the won run
    await play(page, name === 'phone' ? name : null, ['MISS', 'MISS', 'MISS'], s => s === 'dungeon-end' || s === 'dungeon-summary')
    await expect(page.getByText('Defeat').first()).toBeVisible()
    await shot(page, `dungeon/defeat-${name}.png`)
    await endActiveGames(page)
    await leaveLobby(page)
    await ctx.close()
  })
}

// The rooms a run's path may not pass: fights are resolved with the DEV button, up to three runs
for (const [view, name] of VIEWS) {
  test(`the treasure, rest and event rooms (${name})`, async ({ browser }) => {
    test.setTimeout(600_000)
    const { ctx, page } = await open(browser, 'admin', view)
    const seen = new Set<string>()
    const done = () => ['treasure', 'rest', 'event'].every(k => seen.has(k))
    for (let run = 0; run < 3 && !done(); run++) {
      await endActiveGames(page)
      await leaveLobby(page)
      await startRun(page, name, { gameId: 'dungeon', config: { difficulty: 'easy', floors: 9 } })
      await play(page, name, [], s => done() || s === 'dungeon-end' || s === 'dungeon-summary', seen)
    }
    expect([...seen]).toEqual(expect.arrayContaining(['treasure', 'rest', 'event']))
    await endActiveGames(page)
    await leaveLobby(page)
    await ctx.close()
  })
}

test('correcting a dart and fitting every width', async ({ browser }) => {
  test.setTimeout(300_000)
  const { ctx, page } = await open(browser, 'admin', VIEW.desktop)
  await endActiveGames(page)
  await leaveLobby(page)
  await startRun(page, 'desktop', easy)
  await play(page, null, [], s => s === 'dungeon-battle')
  await dart(page, 'S20')
  await dart(page, 'S1')
  await entryMode(page, 'Board')
  await page.getByRole('button', { name: /^Dart 1: S20/ }).click()
  const popover = page.getByRole('dialog', { name: 'Correct dart 1' })
  await expect(popover).toBeVisible()
  await shot(page, 'dungeon-polish/app-battle-correction-desktop.png')
  await popover.getByRole('button', { name: /^T20/ }).click()
  await expect(page.getByRole('button', { name: /^Dart 1: T20/ })).toBeVisible()
  for (const width of [320, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 800 })
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('[data-testid="dungeon-battle"]')
      return document.documentElement.scrollWidth - window.innerWidth + (main ? main.scrollWidth - main.clientWidth : 0)
    })
    expect(overflow, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(0)
  }
  await endActiveGames(page)
  await leaveLobby(page)
  await ctx.close()
})
