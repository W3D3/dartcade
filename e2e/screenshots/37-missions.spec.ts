import { test, expect, type Page } from '@playwright/test'
import {
  VIEW,
  addGuest,
  api,
  dart,
  endActiveGames,
  entryMode,
  hostLobby,
  leaveLobby,
  open,
  openHash,
  shot,
  userId,
  type View,
} from './helpers.js'

// Missions part 2: the list, its dialogs, the play screen and the result; docs/missions/<scene>-<size>.png.
// The list is answered here (the artboards' authors and bests on the real official missions); the games
// are real, entered by hand.

type Card = { id: string; mission: { name: string; difficulty: string }; [k: string]: unknown }
const best = (timeMs: number, darts = 40) => ({ userId: 'u-best', name: 'Lena', timeMs, darts, achievedAt: '2026-11-20T19:00:00.000Z' })

// The artboard's six cards, from the official missions' definitions
async function artboardCards(page: Page): Promise<Card[]> {
  const me = await userId(page)
  const { missions } = (await api(page).get('/api/missions')) as { missions: Card[] }
  const by = (name: string) => missions.find(m => m.mission.name === name)!
  const author = (id: string, name: string) => ({ official: false, author: { id, name }, visibility: 'public' })
  return [
    { ...by('Tungsten Gauntlet'), ...author(me, 'Admin'), id: 'm-tungsten', canEdit: true, yourBest: null, friendsBest: null },
    {
      ...by('Double Trouble Drill'),
      ...author('u-lena', 'Lena'),
      id: 'm-double',
      canEdit: false,
      yourBest: best(462_000),
      friendsBest: best(415_000),
    },
    { ...by('Ton Machine'), ...author('u-max', 'Max'), id: 'm-ton', canEdit: false, yourBest: null, friendsBest: best(490_000) },
    {
      ...by('Bull Rush'),
      ...author('u-anna', 'Anna K.'),
      id: 'm-bull',
      canEdit: false,
      yourBest: best(198_000),
      friendsBest: best(171_000),
    },
    { ...by('Around the Clock Sprint'), yourBest: best(600_000, 38), friendsBest: best(540_000, 31) },
    { ...by('Shanghai Night'), ...author('u-tom', 'Tom'), id: 'm-shanghai', canEdit: false, yourBest: null, friendsBest: best(860_000) },
  ]
}

async function mockList(page: Page, cards: Card[]): Promise<void> {
  await page.route('**/api/missions?*', r => {
    const q = new URL(r.request().url()).searchParams
    const filter = q.get('filter') ?? 'all'
    const difficulty = q.get('difficulty')
    const list =
      filter === 'mine'
        ? cards.slice(0, 1)
        : filter === 'friends'
          ? cards.slice(1, 4).concat(cards[5])
          : filter === 'completed'
            ? []
            : cards
    return r.fulfill({ json: { missions: difficulty ? list.filter(c => c.mission.difficulty === difficulty) : list } })
  })
  await page.route('**/api/missions/*/highscores', r =>
    r.fulfill({
      json: {
        highscores: [
          { ...best(598_000), userId: 'u-lena', name: 'Lena' },
          { ...best(667_000), userId: 'me', name: 'You' },
          { ...best(684_000), userId: 'u-max', name: 'Max' },
          { ...best(785_000), userId: 'u-anna', name: 'Anna K.' },
        ],
      },
    }),
  )
}

const SIZES: [string, View][] = [
  ['desktop', VIEW.wide],
  ['tablet', VIEW.tablet],
  ['phone', { ...VIEW.phone, height: 1400 }],
]

for (const [size, view] of SIZES) {
  test(`the missions list, ${size}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await endActiveGames(page)
    await leaveLobby(page)
    await mockList(page, await artboardCards(page))
    await page.goto('/#/play/missions')
    await expect(page.getByRole('article', { name: 'Tungsten Gauntlet' })).toBeVisible()
    await shot(page, `missions/list-${size}.png`)
    if (size === 'phone') {
      // The phone's card opens the details
      await page
        .getByRole('article', { name: 'Double Trouble Drill' })
        .getByRole('button', { name: 'Double Trouble Drill', exact: true })
        .click()
      await expect(page.getByRole('dialog').getByText('Highscores')).toBeVisible()
      await shot(page, `missions/details-${size}.png`)
    }
    await ctx.close()
  })
}

test('the missions list: filtered, empty, the dialogs', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.wide)
  await mockList(page, await artboardCards(page))
  await page.goto('/#/play/missions')
  await page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Medium' }).click()
  await expect(page.getByRole('article', { name: 'Tungsten Gauntlet' })).toBeHidden()
  await shot(page, 'missions/list-medium-desktop.png')
  await page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Any' }).click()
  await page.goto('/#/play/missions/completed')
  await expect(page.getByText("You haven't completed a mission yet")).toBeVisible()
  await shot(page, 'missions/list-empty-desktop.png')

  await page.goto('/#/play/missions')
  await page.getByRole('button', { name: 'Play Double Trouble Drill' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await shot(page, 'missions/start-desktop.png')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'Double Trouble Drill', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('Highscores')).toBeVisible()
  await shot(page, 'missions/details-desktop.png')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'More for Double Trouble Drill' }).click()
  await page.getByRole('menuitem', { name: 'Report' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await shot(page, 'missions/report-desktop.png')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'More for Tungsten Gauntlet' }).click()
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
  await shot(page, 'missions/owner-menu-desktop.png')
  await ctx.close()
})

// Darts by hand, each visit closed with Next (the visit's takeout)
async function visits(page: Page, ...vs: string[][]): Promise<void> {
  await expect(page.getByRole('button', { name: 'Enter', exact: true })).toBeVisible()
  await entryMode(page, 'Enter')
  for (const [i, v] of vs.entries()) {
    for (const d of v) await (d === 'BULL' ? page.getByRole('button', { name: 'Bull, 50' }).click() : dart(page, d))
    if (i < vs.length - 1 || v.length === 3)
      await page
        .getByRole('button', { name: /^(Takeout · next visit|Next player)$/ })
        .first()
        .click()
  }
}

async function soloMission(page: Page): Promise<string> {
  await endActiveGames(page)
  await leaveLobby(page)
  const { sessionId } = (await api(page).post('/api/missions/official-tungsten-gauntlet/start', {})) as { sessionId: string }
  await openHash(page, `/session/${sessionId}`)
  return sessionId
}

test('the play screen solo, its sizes, and the result', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.wide)
  const id = await soloMission(page)
  // Step 1: 170 out (T20 T20 Bull); step 2: a streak of 5 in S20, two of them this visit
  await visits(page, ['T20', 'T20', 'BULL'], ['S20', 'S20', 'S20'], ['S20', 'S20'])
  await entryMode(page, 'Board')
  await expect(page.getByRole('region', { name: /step 2: 5 of 9/ })).toBeVisible()
  await shot(page, 'missions/play-desktop.png')
  for (const [size, view] of [
    ['tablet', VIEW.tablet],
    ['phone', VIEW.phone],
    ['portrait', VIEW.tabletPortrait],
  ] as const) {
    const other = await open(browser, 'admin', view)
    await openHash(other.page, `/session/${id}`)
    await expect(other.page.getByRole('region', { name: /step 2: 5 of 9/ })).toBeVisible()
    await shot(other.page, `missions/play-${size}.png`)
    await other.ctx.close()
  }
  // Finish it: four more S20, then D11 → Bull → D6
  await visits(page, ['S20'], ['S20', 'S20', 'S20'], ['D11', 'BULL', 'D6'])
  await expect(page.getByRole('heading', { name: 'Mission complete' })).toBeVisible()
  await shot(page, 'missions/result-complete-desktop.png')
  await ctx.close()
})

test('give up', async ({ browser }) => {
  const wide = await open(browser, 'admin', VIEW.wide)
  const id = await soloMission(wide.page)
  await visits(wide.page, ['T20', 'S5', 'S1'])
  await entryMode(wide.page, 'Board')
  await wide.ctx.close()
  const { ctx, page } = await open(browser, 'admin', VIEW.phone)
  await openHash(page, `/session/${id}`)
  await page.getByRole('button', { name: 'Give up' }).click()
  await shot(page, 'missions/give-up-phone.png')
  await page.getByRole('dialog').getByRole('button', { name: 'Give up' }).click()
  await expect(page.getByRole('heading', { name: 'Gave up' })).toBeVisible()
  await shot(page, 'missions/result-gave-up-phone.png')
  await ctx.close()
})

test('the play screen with three players', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.wide)
  const lobby = await hostLobby(page, 'Friday darts')
  await addGuest(page, lobby, 'Lena')
  await addGuest(page, lobby, 'Max')
  const { sessionId } = (await api(page).post('/api/missions/official-tungsten-gauntlet/start', { lobbyId: lobby.id, force: true })) as {
    sessionId: string
  }
  await openHash(page, `/session/${sessionId}`)
  // Admin checks 170 out, Lena and Max start step 1; Admin then two S20s
  await visits(page, ['T20', 'T20', 'BULL'], ['T20', 'S20', 'S10'], ['T19', 'S19', 'S1'], ['S20', 'S20'])
  await entryMode(page, 'Board')
  await expect(page.getByRole('region', { name: 'Other players' })).toBeVisible()
  await shot(page, 'missions/play-multi-desktop.png')
  const phone = await open(browser, 'admin', VIEW.phone)
  await openHash(phone.page, `/session/${sessionId}`)
  await entryMode(phone.page, 'Board')
  await shot(phone.page, 'missions/play-multi-phone.png', { fullPage: true })
  await phone.ctx.close()
  // Everyone gives up in turn: the places
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Give up' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Give up' }).click()
  }
  await expect(page.getByRole('region', { name: 'Players' })).toBeVisible()
  await shot(page, 'missions/result-multi-desktop.png')
  await leaveLobby(page)
  await ctx.close()
})
