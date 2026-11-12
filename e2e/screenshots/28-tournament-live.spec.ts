import { test, expect, type Page } from '@playwright/test'
import { VIEW, open, openHash, shot, userId } from './helpers.js'

// The live bracket (Tournament-Live), from mocked answers: an 8-player knockout in its
// quarter-finals, your own match live (Back to the match, no Watch), another one live (Watch),
// the schedule and the rules; on a phone the bracket scrolls sideways inside its card.
const tournament = {
  id: 'living-room',
  name: 'Living Room Classic',
  kind: 'community',
  access: 'friends',
  status: 'running',
  gameId: 'x01',
  gameConfig: { startScore: 501, outMode: 'double' },
  format: 'single_elimination',
  teamSize: 1,
  maxEntries: 8,
  entries: 8,
  owner: { id: 'lena', name: 'Lena' },
  description: 'Our Thursday knockout. First to 3, double out.',
  startsAt: '2026-11-12T19:00:00Z',
  settings: {
    seeding: 'rating',
    firstTo: 3,
    longerFinal: null,
    groups: null,
    registrationClosesMinutes: null,
    checkInMinutes: 5,
    plannedFor: null,
    manualScoring: false,
    noShowMinutes: 10,
    avgLimit: null,
  },
  role: null,
  locked: true,
  createdAt: '2026-11-01T10:00:00Z',
  publishedAt: '2026-11-01T10:00:00Z',
  registration: 'registered',
  registrationClosesAt: null,
  inviteCode: null,
  friendsIn: [],
  checkedIn: true,
}

const PEOPLE = ['me', 'max', 'lena', 'tom', 'anna', 'sophie', 'jule', 'marco']
const NAMES: Record<string, string> = {
  max: 'Max',
  lena: 'Lena',
  tom: 'Tom',
  anna: 'Anna K.',
  sophie: 'Sophie',
  jule: 'Jule',
  marco: 'Marco',
}

function live(me: string) {
  const entries = PEOPLE.map((p, i) => ({
    id: p,
    name: p === 'me' ? 'Admin' : NAMES[p],
    status: 'checked_in',
    seed: i + 1,
    finalPlace: null,
    players: [{ userId: p === 'me' ? me : p, name: p, avatar: { kind: 'none' } }],
  }))
  const m = (key: string, round: number, index: number, over: object) => ({
    key,
    bracket: 'main',
    group: null,
    round,
    index,
    firstTo: 3,
    status: 'pending',
    sides: [null, null],
    outcome: null,
    winner: null,
    legs: [0, 0],
    game: null,
    ...over,
  })
  const done = (a: string, b: string, legs: [number, number]) => ({
    status: 'finished',
    sides: [a, b],
    outcome: 'played',
    winner: legs[0] > legs[1] ? 0 : 1,
    legs,
  })
  return {
    type: 'tournament.live',
    tournamentId: tournament.id,
    status: 'running',
    entries,
    matches: [
      m('R1M1', 1, 1, { status: 'live', sides: ['me', 'max'], legs: [1, 2], game: { sessionId: 'game-me', throwing: 1 } }),
      m('R1M2', 1, 2, done('lena', 'tom', [3, 1])),
      m('R1M3', 1, 3, done('anna', 'sophie', [3, 2])),
      m('R1M4', 1, 4, done('jule', 'marco', [0, 3])),
      m('R2M1', 2, 1, { sides: [null, 'lena'] }),
      m('R2M2', 2, 2, { status: 'live', sides: ['anna', 'marco'], legs: [1, 1], game: { sessionId: 'game-sf', throwing: 0 } }),
      m('R3M1', 3, 1, {}),
    ],
    tables: [],
    schedule: [
      { bracket: 'main', round: 1, name: 'Quarter-finals', state: 'now', at: null },
      { bracket: 'main', round: 2, name: 'Semi-finals', state: 'later', at: '2026-11-12T20:10:00Z' },
      { bracket: 'main', round: 3, name: 'Final', state: 'later', at: '2026-11-12T20:50:00Z' },
    ],
  }
}

async function mock(page: Page): Promise<void> {
  const me = await userId(page)
  await page.route('**/api/tournaments/living-room', r => r.fulfill({ json: tournament }))
  await page.routeWebSocket('**/ws/tournament?*', ws => {
    ws.send(JSON.stringify(live(me)))
  })
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  test(`tournament live: bracket ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page)
    await openHash(s.page, '/tournaments/living-room')
    await expect(s.page.getByText('Your match is on')).toBeVisible()
    // Watch on the other live match only, never on your own
    await expect(s.page.getByRole('link', { name: /^Watch/ })).toHaveCount(1)
    await expect(s.page.getByRole('link', { name: 'Watch Anna K. vs Marco' })).toHaveAttribute('href', '#/watch/game-sf')
    await expect(s.page.getByRole('link', { name: /Back to the match/ })).toHaveAttribute('href', '#/session/game-me')
    // No sideways page scroll on a phone: the bracket scrolls inside its card
    const pageWidth = await s.page.evaluate(() => document.querySelector('main')?.scrollWidth ?? 0)
    expect(pageWidth).toBeLessThanOrEqual(view.width)
    await shot(s.page, `tournaments/live-${name}.png`)
  })
}
