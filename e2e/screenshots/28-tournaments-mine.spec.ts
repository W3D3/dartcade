import { test, expect, type Page } from '@playwright/test'
import { VIEW, open, openHash, shot } from './helpers.js'

// My tournaments (Tournaments-Mine, Tournaments-Mine-Phone) and Browse's "Up next for you", from
// mocked answers: a match being played, a team waiting for a teammate, a league, an in-person
// night you play in, what you organize and what you have played.
const ref = {
  kind: 'community',
  access: 'public',
  status: 'open',
  gameId: 'x01',
  gameConfig: { startScore: 501, outMode: 'double' },
  format: 'single_elimination',
  teamSize: 1,
  maxEntries: 16,
  entries: 8,
  startsAt: null,
  owner: { id: 'max', name: 'Max' },
}
const playing = (id: string, name: string, over: object, extra: object = {}) => ({
  tournament: { ...ref, id, name, ...over },
  entryName: 'Christoph',
  playerName: 'Christoph',
  team: null,
  opponent: null,
  ...extra,
})
const living = { ...ref, id: 'living', name: 'Living Room Classic', status: 'running', owner: { id: 'lena', name: 'Lena' } }
const past = (id: string, name: string, over: object, extra: object) => ({
  tournament: { ...ref, id, name, status: 'finished', ...over },
  entryName: 'Christoph',
  playerName: 'Christoph',
  endedAt: '2026-10-20T20:00:00Z',
  ...extra,
})
const mine = {
  liveMatch: { tournament: living, round: 'Quarter-final', opponent: 'Max', firstTo: 3, sessionId: 'live-game' },
  playing: [
    playing('living', 'Living Room Classic', living, { opponent: 'Max' }),
    playing(
      'doubles',
      'November Doubles Cup',
      { kind: 'official', teamSize: 2, format: 'double_elimination', maxEntries: 32, startsAt: '2026-11-15T20:00:00Z', owner: null },
      {
        entryName: 'Double Agents',
        team: {
          entryId: 'e',
          status: 'pending',
          team: null,
          captainId: 'me',
          confirmBy: null,
          slots: [
            { position: 0, user: { id: 'me', name: 'Christoph' }, confirmed: true },
            { position: 1, user: { id: 'lena', name: 'Lena' }, confirmed: false },
          ],
        },
      },
    ),
    playing(
      'league',
      'Friday Darts League',
      { format: 'round_robin', status: 'running', gameConfig: { startScore: 301 }, startsAt: '2026-11-14T20:00:00Z' },
      { opponent: 'Tom' },
    ),
    playing('pub', 'Anchor Pub League · Week 3', { access: 'in_person', startsAt: '2026-11-12T21:00:00Z' }, { playerName: 'Chris' }),
  ],
  organizing: [
    {
      tournament: {
        ...ref,
        id: 'club',
        name: 'Spring Club Night',
        access: 'in_person',
        maxEntries: 8,
        startsAt: '2026-11-28T19:00:00Z',
        owner: { id: 'me', name: 'Christoph' },
      },
      role: 'owner',
      claimed: 2,
      createdAt: '2026-11-01T10:00:00Z',
    },
    {
      tournament: { ...ref, id: 'office', name: 'Office Cup 2026', access: 'invite', entries: 11, startsAt: '2026-12-13T18:00:00Z' },
      role: 'organizer',
      claimed: null,
      createdAt: '2026-11-02T10:00:00Z',
    },
    {
      tournament: { ...ref, id: 'cracker', name: 'Christmas Cracker', status: 'draft', entries: 0, owner: { id: 'me', name: 'Christoph' } },
      role: 'owner',
      claimed: null,
      createdAt: '2026-11-10T10:00:00Z',
    },
  ],
  past: [
    past(
      'p1',
      'Anchor Pub League · Week 2',
      { access: 'in_person' },
      { playerName: 'Chris', place: 3, won: 2, lost: 1, average: 66.5, endedAt: '2026-11-04T20:00:00Z' },
    ),
    past(
      'p2',
      'Halloween Doubles',
      { teamSize: 2 },
      { entryName: 'Double Agents', place: 5, won: 2, lost: 1, average: 70.2, endedAt: '2026-10-31T20:00:00Z' },
    ),
    past(
      'p3',
      'Dartcade Weekly Open #44',
      { kind: 'official', maxEntries: 32 },
      { place: 9, won: 2, lost: 1, average: 68.1, endedAt: '2026-10-26T20:00:00Z' },
    ),
    past(
      'p4',
      'Pub Pairs Showdown',
      { teamSize: 2 },
      { entryName: 'Double Agents', place: 2, won: 4, lost: 1, average: 72.9, endedAt: '2026-10-19T20:00:00Z' },
    ),
    past('p5', 'Living Room Classic #3', {}, { place: 1, won: 3, lost: 0, average: 74, endedAt: '2026-10-12T20:00:00Z' }),
  ],
  season: {
    label: 'Q4 2026',
    played: 9,
    titles: 1,
    won: 21,
    lost: 11,
    average: 69.8,
    best: { place: 1, tournament: 'Living Room Classic #3' },
  },
}

async function mock(page: Page) {
  await page.route('**/api/tournaments/mine', r => r.fulfill({ json: mine }))
  await page.route('**/api/tournaments', r => r.fulfill({ json: { tournaments: [] } }))
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  test(`tournaments mine: ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await s.page.setViewportSize({ width: view.width, height: name === 'phone' ? 1750 : 1500 })
    await mock(s.page)
    await openHash(s.page, '/tournaments/mine')
    await expect(
      s.page
        .getByRole('link', { name: 'Back to the match' })
        .or(s.page.getByRole('button', { name: 'Back to the match' }))
        .first(),
    ).toBeVisible()
    await expect(s.page.getByText('Waiting for Lena to confirm').first()).toBeVisible()
    await shot(s.page, `tournaments/mine-${name}.png`)
  })
}

test('tournaments mine: up next on Browse', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.wide)
  await mock(s.page)
  await openHash(s.page, '/tournaments/browse')
  await expect(s.page.getByRole('heading', { name: 'Up next for you' })).toBeVisible()
  await shot(s.page, 'tournaments/browse-up-next-desktop.png')
})
