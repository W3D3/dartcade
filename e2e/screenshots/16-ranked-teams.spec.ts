import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { VIEW, open, shot, hostLobby, addGuest, startLobbyGame, dart, X01, BASE, api } from './helpers.js'

// The stack has no ranked games, so the game snapshot gets what the server would add: a `ranked`
// state with per-seat ratings, and seats on other boards so the viewer's duo watches the opponents.
// RANKED_TEAMS_PREFIX names the files ("before-"), to shoot the same scenes on another build.
const PREFIX = process.env.RANKED_TEAMS_PREFIX ?? ''
const DIR = 'ranked-teams'
const SECOND = 1000

/** Ends the viewer's running games through the API: the phone header has no End button to click. */
async function endGames(page: Page) {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  const { sessions } = (await api(page).get('/api/sessions')) as { sessions: { id: string; status: string }[] }
  for (const s of sessions.filter(s => s.status === 'active'))
    await page.request.delete(`/api/sessions/${s.id}`, { headers: { Origin: BASE } })
}

type Scene = 'throwing' | 'reserve' | 'rows'

// Seat order: Christoph and Lena are the viewer's duo, Marco and Jule the opponents, Anna a fifth
const PEOPLE = [
  { name: 'Christoph', rating: 1241, rankIndex: 14, board: 'Living room' },
  { name: 'Marco', rating: 1248, rankIndex: 15, board: "Marco's board" },
  { name: 'Lena', rating: 1211, rankIndex: 14, board: "Lena's place" },
  { name: 'Jule', rating: 1212, rankIndex: 14, board: "Jule's board" },
]

function rankedState(scene: Scene, seats: number) {
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()
  const stakes = { win: 16, loss: 14 }
  const people = scene === 'rows' ? [...PEOPLE.slice(0, 3)] : PEOPLE
  return {
    now: iso(now),
    mode: scene === 'rows' ? '1v1' : '2v2',
    visitSeconds: 120,
    reserveSeconds: 300,
    manualEntry: false,
    visitDeadline: iso(now + (scene === 'reserve' ? -5 : 100) * SECOND),
    forfeitAt: iso(now + (scene === 'reserve' ? 19 : 400) * SECOND),
    seats: people.slice(0, seats).map((p, i) => ({
      reserveSeconds: scene === 'reserve' && i === 1 ? 19 : 300 - i * 40,
      inReserve: scene === 'reserve' && i === 1,
      disconnectForfeitAt: null,
      stakes,
      rating: p.rating,
      rankIndex: p.rankIndex,
      placement: null,
      result: null,
    })),
  }
}

/** Every game snapshot is a ranked one of `scene`; the viewer plays `mine`, the other seats are on boards of their own. */
async function rankedSnapshots(page: Page, scene: () => Scene | null, mine: number[]) {
  await page.routeWebSocket(/\/ws\?/, ws => {
    const server = ws.connectToServer()
    ws.onMessage(m => server.send(m))
    server.onMessage(m => {
      try {
        const msg = JSON.parse(String(m))
        const s = scene()
        if (msg.type === 'snapshot' && s) {
          msg.ranked = rankedState(s, msg.seats.length)
          msg.mySeats = mine
          msg.seats.forEach((seat: Record<string, unknown>, i: number) => {
            const p = PEOPLE[i]
            msg.players[i].name = p.name
            seat.boardOnline = true
            seat.boardName = p.board
            seat.boardId = mine.includes(i) ? 'b-mine' : `b-${i}`
            seat.controllerUserId = mine.includes(i) ? 'me' : `u-${i}`
            seat.controllerConnected = true
          })
        }
        ws.send(JSON.stringify(msg))
      } catch {
        ws.send(m)
      }
    })
  })
}

for (const [view, name] of [
  [VIEW.wide, 'desktop'],
  [VIEW.phone, 'phone'],
] as const) {
  test(`a ranked 2v2 match, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    const lobby = await hostLobby(page, 'Ranked 2v2', X01({ format: 'teams', firstTo: 2 }))
    for (const guest of ['Marco', 'Lena', 'Jule']) await addGuest(page, lobby, guest)
    let scene: Scene | null = null
    await rankedSnapshots(page, () => scene, [0, 2])
    await startLobbyGame(page, lobby)
    // The duo's first visit, then Marco's first two darts: the opponents are up
    await page.getByRole('button', { name: /^(Enter|Enter darts by number)$/ }).click()
    await expect(page.getByRole('button', { name: 'Treble', exact: true })).toBeVisible()
    for (const d of ['T20', 'T20', 'S20']) await dart(page, d)
    await page.getByRole('button', { name: /Next/ }).first().click()
    for (const d of ['T20', 'S5']) await dart(page, d)
    for (const s of ['throwing', 'reserve'] as const) {
      scene = s
      await page.reload()
      await expect(page.getByText('Ranked', { exact: true }).first()).toBeVisible()
      await shot(page, `${DIR}/${PREFIX}${s}-${name}.png`, { settle: 900 })
    }
    await endGames(page)
    await ctx.close()
  })
}

test('a ranked match with three players, desktop', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.wide)
  const lobby = await hostLobby(page, 'Ranked rows', X01({ firstTo: 2 }))
  for (const guest of ['Marco', 'Lena']) await addGuest(page, lobby, guest)
  await rankedSnapshots(page, () => 'rows', [0])
  await startLobbyGame(page, lobby)
  await expect(page.getByText('Ranked', { exact: true }).first()).toBeVisible()
  await shot(page, `${DIR}/${PREFIX}rows-desktop.png`, { settle: 900 })
  await endGames(page)
  await ctx.close()
})
