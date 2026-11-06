import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BASE, VIEW, api, open, shot, hostLobby, addGuest, startLobbyGame, endActiveGames, dart, X01 } from './helpers.js'

// The stack has no ranked games or queue, so what the screens need is added to the sockets' messages
// here: the game snapshot's `ranked`, the `matchmaking` message on /ws/me, and the profile for the result.
// RANKED_DIR names the docs folder, to shoot the same scenes on another build.
const DIR = process.env.RANKED_DIR ?? 'ranked-ingame'

type Scene = 'header' | 'visit' | 'reserve' | 'away' | 'result'
const SECOND = 1000

/** Ends the viewer's running games through the API: the phone header has no End button to click. */
async function endGames(page: Page) {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  const { sessions } = (await api(page).get('/api/sessions')) as { sessions: { id: string; status: string }[] }
  for (const s of sessions.filter(s => s.status === 'active'))
    await page.request.delete(`/api/sessions/${s.id}`, { headers: { Origin: BASE } })
}

/** The snapshot's `ranked`, as the server would build it, with the deadlines relative to now. */
function rankedState(scene: Scene) {
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()
  const stakes = { win: 16, loss: 14 }
  const seat = (over = {}) => ({
    reserveSeconds: 300,
    inReserve: false,
    disconnectForfeitAt: null,
    stakes,
    rating: 1284,
    rankIndex: 14,
    placement: null,
    result: null,
    ...over,
  })
  const anna = { rating: 1301, rankIndex: 15 }
  const base = { now: iso(now), mode: '1v1', visitSeconds: 120, reserveSeconds: 300, manualEntry: true }
  switch (scene) {
    case 'header':
      return { ...base, visitDeadline: iso(now + 110 * SECOND), forfeitAt: iso(now + 410 * SECOND), seats: [seat(), seat(anna)] }
    case 'visit':
      return { ...base, visitDeadline: iso(now + 19 * SECOND), forfeitAt: iso(now + 319 * SECOND), seats: [seat(), seat(anna)] }
    case 'reserve':
      return {
        ...base,
        visitDeadline: iso(now - 5 * SECOND),
        forfeitAt: iso(now + 14 * SECOND),
        seats: [seat({ reserveSeconds: 14, inReserve: true }), seat(anna)],
      }
    case 'away':
      return {
        ...base,
        visitDeadline: iso(now + 110 * SECOND),
        forfeitAt: iso(now + 410 * SECOND),
        seats: [seat(), seat({ ...anna, disconnectForfeitAt: iso(now + 102 * SECOND) })],
      }
    case 'result':
      // 1 293 was Silver V, 1 310 is Gold I: what the server records when the game ends
      return {
        ...base,
        visitDeadline: null,
        forfeitAt: null,
        seats: [seat({ rating: 1293, result: { change: 17, rankIndexBefore: 14, rankIndexAfter: 15 } }), seat(anna)],
      }
  }
}

/** Every game snapshot is a ranked one of `scene`, and the viewer plays the first seat only. */
async function rankedSnapshots(page: Page, scene: () => Scene) {
  await page.routeWebSocket(/\/ws\?/, ws => {
    const server = ws.connectToServer()
    ws.onMessage(m => server.send(m))
    server.onMessage(m => {
      try {
        const msg = JSON.parse(String(m))
        if (msg.type === 'snapshot') {
          msg.ranked = rankedState(scene())
          msg.mySeats = [0]
          for (const seat of msg.seats) seat.boardOnline = true
        }
        ws.send(JSON.stringify(msg))
      } catch {
        ws.send(m)
      }
    })
  })
}

for (const [view, name] of [
  [VIEW.desktop, 'desktop'],
  [VIEW.phone, 'phone'],
] as const) {
  test(`a ranked match, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    const lobby = await hostLobby(page, 'Ranked 1v1', X01())
    await addGuest(page, lobby, 'Anna K.')
    let scene: Scene = 'header'
    await rankedSnapshots(page, () => scene)
    await startLobbyGame(page, lobby)
    for (const s of ['header', 'visit', 'reserve', 'away'] as const) {
      scene = s
      await page.reload()
      await expect(page.getByText('Ranked', { exact: true }).first()).toBeVisible()
      await shot(page, `${DIR}/${s}-${name}.png`, { settle: 900 })
    }
    await endGames(page)
    await ctx.close()
  })

  test(`a ranked result, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    const lobby = await hostLobby(page, 'Ranked 1v1', X01({ startScore: 40, firstTo: 1 }))
    await addGuest(page, lobby, 'Anna K.')
    await rankedSnapshots(page, () => 'result')
    const sessionId = await startLobbyGame(page, lobby)
    // 1 293 was Silver V, 1 310 is Gold I: the profile the server serves once the game is recorded
    await page.route('**/api/ranked/me', route =>
      route.fulfill({
        json: {
          ratings: [
            { mode: '1v1', rating: 1310, rankIndex: 15, matches: 41, wins: 24, streak: 4, change30d: 46 },
            { mode: '2v2', rating: null, rankIndex: null, matches: 0, wins: 0, streak: 0, change30d: 0 },
          ],
          onlineAverage: 59,
          recent: [
            {
              sessionId,
              mode: '1v1',
              won: true,
              change: 17,
              at: new Date().toISOString(),
              opponents: [{ userId: 'anna', name: 'Anna K.', rating: 1301, avatar: { type: 'none' } }],
            },
          ],
        },
      }),
    )
    await page.getByRole('button', { name: /^(Enter|Enter darts by number)$/ }).click()
    await expect(page.getByRole('button', { name: 'Double', exact: true })).toBeVisible()
    await dart(page, 'D20')
    await page.getByRole('button', { name: /Finish/ }).click()
    await expect(page.getByText('Find next match')).toBeVisible()
    await expect(page.getByText('Promoted')).toBeVisible()
    await shot(page, `${DIR}/result-${name}.png`, { settle: 1500 })
    await endGames(page)
    await ctx.close()
  })
}

const SEARCH = {
  mode: '1v1',
  firstTo: 2,
  since: new Date(Date.now() - 72 * SECOND).toISOString(),
  range: 75,
  rating: 1284,
  hostUserId: 'me',
  players: ['Christoph'],
  searching: 212,
}

/** The /ws/me socket also says the viewer's ranked search or found match; `state` is read on each message. */
async function queue(page: Page, state: () => object) {
  await page.routeWebSocket(/\/ws\/me/, ws => {
    const server = ws.connectToServer()
    ws.onMessage(m => server.send(m))
    server.onMessage(m => {
      ws.send(m)
      ws.send(JSON.stringify({ type: 'matchmaking', pausedUntil: null, ...state() }))
    })
  })
}

for (const [view, name] of [
  [VIEW.wide, 'desktop'],
  [VIEW.tablet, 'tablet'],
  [VIEW.phone, 'phone'],
] as const) {
  test(`the ranked queue on the lobby card, rail and strip, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await endActiveGames(page)
    let state: object = {}
    await queue(page, () => state)
    const me = (await (await page.request.get('/api/me')).json()) as { id: string }
    const search = { ...SEARCH, hostUserId: me.id }
    const seat = (accepted: boolean) => ({ person: null, accepted, you: false })
    const found = {
      id: 'm1',
      expiresAt: '',
      acceptSeconds: 60,
      mode: '1v1',
      firstTo: 2,
      range: 75,
      stakes: { win: 16, loss: 14 },
      yours: [{ ...seat(false), you: true }],
      theirs: [seat(false)],
    }
    for (const [file, s] of [
      ['searching', { search, match: null }],
      ['found', { search, match: found }],
    ] as const) {
      state = file === 'found' ? { ...s, match: { ...found, expiresAt: new Date(Date.now() + 44 * SECOND).toISOString() } } : s
      await page.goto('/#/play')
      await page.reload()
      await page.waitForTimeout(1500)
      await shot(page, `${DIR}/queue-${file}-${name}.png`, { settle: 900 })
    }
    await ctx.close()
  })
}

test('the duo lobby while it searches', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.wide)
  const lobby = await hostLobby(page, 'Ranked duo', X01())
  await addGuest(page, lobby, 'Lena')
  const me = (await (await page.request.get('/api/me')).json()) as { id: string }
  await queue(page, () => ({
    search: { ...SEARCH, mode: '2v2', hostUserId: me.id, players: ['Admin', 'Lena'], rating: 1226, searching: 38 },
    match: null,
  }))
  await openHashLobby(page)
  await expect(page.getByText(/locked while you search/)).toBeVisible()
  await shot(page, `${DIR}/lobby-searching-desktop.png`, { settle: 900 })
  await endActiveGames(page)
  await ctx.close()
})

async function openHashLobby(page: Page) {
  await page.goto('/#/lobby')
  await page.reload()
}
