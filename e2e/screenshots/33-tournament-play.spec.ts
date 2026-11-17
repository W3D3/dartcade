import { test, expect, type Page } from '@playwright/test'
import { BASE, VIEW, api, open, openHash, shot } from './helpers.js'

// Playing a match from tournament mode (Tournament-Mode-Board, Tournament-Mode-Match). The board
// picker runs on a mocked state like the design's quarter-finals (QF 2 live on Board 2, Living room
// offline); the real server runs the start: no board, a second device refused, the match screen
// inside the tournament bar.

const NAMES = ['Anna Berger', 'Jonas', 'Mia K.', 'Paul', 'Sven', 'Lea', 'Tom', 'Nico']
const tournament = {
  id: 'venue',
  name: 'Spring Club Night',
  kind: 'community',
  play: 'in_person',
  preselected: true,
  visibility: 'public',
  status: 'running',
  gameId: 'x01',
  gameConfig: { startScore: 501, outMode: 'double' },
  format: 'single_elimination',
  teamSize: 1,
  maxEntries: 8,
  entries: 8,
  owner: { id: 'admin', name: 'Admin' },
  description: '',
  startsAt: null,
  settings: {
    seeding: 'random',
    firstTo: 3,
    longerFinal: null,
    groups: null,
    registrationClosesMinutes: null,
    checkInMinutes: null,
    plannedFor: '2026-11-28T18:00:00.000Z',
    manualScoring: true,
    noShowMinutes: null,
    avgLimit: null,
  },
  role: 'owner',
  locked: false,
  createdAt: '2026-11-01T10:00:00Z',
  publishedAt: '2026-11-01T10:00:00Z',
  registration: 'preselected',
  registrationClosesAt: null,
  inviteCode: null,
  friendsIn: [],
  checkedIn: false,
}
const m = (key: string, round: number, index: number, over: object = {}) => ({
  key,
  bracket: 'main',
  group: null,
  round,
  index,
  firstTo: 3,
  status: 'pending',
  sides: [null, null],
  finishedAt: null,
  outcome: null,
  winner: null,
  legs: [0, 0],
  game: null,
  ...over,
})
const state = {
  type: 'tournament.live',
  tournamentId: 'venue',
  status: 'running',
  entries: NAMES.map((name, i) => ({
    id: `e${i}`,
    name,
    status: 'registered',
    seed: i + 1,
    finalPlace: null,
    players: [{ userId: null, name, avatar: { kind: 'none' } }],
  })),
  matches: [
    m('R1M1', 1, 1, {
      status: 'finished',
      sides: ['e0', 'e1'],
      outcome: 'played',
      winner: 0,
      legs: [3, 1],
      finishedAt: '2026-11-28T18:42:00Z',
    }),
    m('R1M2', 1, 2, { status: 'live', sides: ['e2', 'e3'], legs: [2, 1], game: { sessionId: 'game-qf2', throwing: 0, score: [132, 40] } }),
    m('R1M3', 1, 3, { status: 'ready', sides: ['e4', 'e5'] }),
    m('R1M4', 1, 4, { status: 'ready', sides: ['e6', 'e7'] }),
    m('R2M1', 2, 1, { sides: ['e0', null] }),
    m('R2M2', 2, 2),
    m('R3M1', 3, 1),
  ],
  tables: [],
  schedule: [
    { bracket: 'main', round: 1, name: 'Quarter-finals', state: 'now', at: null },
    { bracket: 'main', round: 2, name: 'Semi-finals', state: 'later', at: null },
    { bracket: 'main', round: 3, name: 'Final', state: 'later', at: null },
  ],
}
const boards = [
  { id: 'b1', name: 'Board 1 · Bar', state: 'free', matchKey: null },
  { id: 'b2', name: 'Board 2 · Corner', state: 'in_use', matchKey: 'R1M2' },
  { id: 'b3', name: 'Living room', state: 'offline', matchKey: null },
]

async function mock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem('tournamentMode.deviceId', 'tab-bar')
    localStorage.setItem('tournamentMode.deviceName', 'Tablet · Bar')
    localStorage.setItem('tournamentMode.lastBoard', 'b1')
  })
  await page.route('**/api/tournaments/venue', r => r.fulfill({ json: tournament }))
  await page.route('**/api/tournaments/venue/play-boards', r => r.fulfill({ json: { boards, choosesFirst: true } }))
  await page.routeWebSocket('**/ws/tournament?*', ws => {
    ws.send(JSON.stringify(state))
    ws.send(
      JSON.stringify({
        type: 'tournament.devices',
        tournamentId: 'venue',
        devices: [{ id: 'tab-bar', name: 'Tablet · Bar', matchKey: null }],
      }),
    )
  })
}

for (const [name, view] of [
  ['tablet', VIEW.tablet],
  ['phone', VIEW.phone],
] as const) {
  test(`tournament play: where are you playing ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page)
    await openHash(s.page, '/tournament-mode/venue')
    await s.page.getByRole('button', { name: 'Play', exact: true }).first().click()
    const dialog = s.page.getByRole('dialog', { name: 'Where are you playing?' })
    await expect(dialog).toContainText('Free · last used on this device')
    await expect(dialog).toContainText('In use · QF 2, Mia K. vs Paul')
    await expect(dialog).toContainText('Offline')
    // A board in use or offline can't be picked
    await expect(dialog.getByRole('radio', { name: /Corner/ })).toBeDisabled()
    await expect(dialog.getByRole('radio', { name: /Living room/ })).toBeDisabled()
    await shot(s.page, `tournaments/play-board-${name}.png`)
  })
}

test('tournament play: start with no board, a second device is refused, the match shows in the bar', async ({ browser }) => {
  const admin = await open(browser, 'admin', VIEW.wide)
  const mine = (await api(admin.page).get('/api/tournaments/mine')) as { organizing: { tournament: { id: string; status: string } }[] }
  for (const { tournament: t } of mine.organizing) {
    if (t.status === 'draft') await admin.page.request.delete(`/api/tournaments/${t.id}`, { headers: { Origin: BASE } })
    else if (t.status === 'open' || t.status === 'running') await api(admin.page).post(`/api/tournaments/${t.id}/cancel`)
  }
  const { name, description, play, preselected, visibility, gameId, gameConfig, format, teamSize, maxEntries, startsAt, settings } =
    tournament
  const t = (await api(admin.page).post('/api/tournaments', {
    name,
    description,
    play,
    preselected,
    visibility,
    gameId,
    gameConfig,
    format,
    teamSize,
    maxEntries,
    startsAt,
    settings,
  })) as { id: string }
  await api(admin.page).post(`/api/tournaments/${t.id}/publish`)
  await api(admin.page).put(`/api/tournaments/${t.id}/participants`, {
    entries: NAMES.map(name => ({ name, tag: null, color: null, players: [{ name }] })),
  })
  await api(admin.page).post(`/api/tournaments/${t.id}/start`)

  const tablet = await open(browser, 'admin', VIEW.tablet)
  await tablet.page.addInitScript(() => localStorage.setItem('tournamentMode.deviceName', 'Tablet · Bar'))
  await openHash(tablet.page, `/tournament-mode/${t.id}`)
  await tablet.page.getByRole('button', { name: 'Play', exact: true }).first().click()
  const dialog = tablet.page.getByRole('dialog', { name: 'Where are you playing?' })
  await expect(dialog.getByRole('radio', { name: /No board/ })).toBeChecked()
  await dialog.getByRole('button', { name: 'Start match' }).click()

  // The match screen, with the tournament bar above it and the keypad for hand entry
  await expect(tablet.page).toHaveURL(/#\/session\//)
  await expect(tablet.page.getByText('TOURNAMENT MODE', { exact: true })).toBeVisible()
  await expect(tablet.page.getByRole('button', { name: 'Matches' })).toBeVisible()
  await shot(tablet.page, 'tournaments/play-match-tablet.png')

  // A second device starting the same match is refused
  expect(await api(tablet.page).tryPost(`/api/tournaments/${t.id}/matches/R1M1/start`, { boardId: null, first: 'bull_off' })).toBe(409)
})
