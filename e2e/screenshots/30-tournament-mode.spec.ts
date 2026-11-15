import { test, expect, type Page } from '@playwright/test'
import { BASE, VIEW, api, open, openHash, shot } from './helpers.js'

// Tournament mode on venue devices (Tournament-Mode, Tournament-Mode-Exit, Tournament-Onsite's
// devices card). The running state is mocked like the design's quarter-finals (QF 2 live on
// another tablet, QF 3 ready, QF 1 and a forfeit done); the devices card and the start run on the
// real server, two browsers on one account each in tournament mode.

const tournament = {
  id: 'venue',
  name: 'Spring Club Night',
  kind: 'community',
  access: 'in_person',
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
  registration: 'in_person',
  registrationClosesAt: null,
  inviteCode: null,
  friendsIn: [],
  checkedIn: false,
}

const NAMES = ['Anna Berger', 'Jonas', 'Mia K.', 'Paul', 'Sven', 'Lea', 'Tom', 'Nico']
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
    m('R1M4', 1, 4, { status: 'finished', sides: ['e6', 'e7'], outcome: 'walkover', winner: 0, finishedAt: '2026-11-28T18:20:00Z' }),
    m('R2M1', 2, 1, { sides: ['e0', null] }),
    m('R2M2', 2, 2, { sides: [null, 'e6'] }),
    m('R3M1', 3, 1),
  ],
  tables: [],
  schedule: [
    { bracket: 'main', round: 1, name: 'Quarter-finals', state: 'now', at: null },
    { bracket: 'main', round: 2, name: 'Semi-finals', state: 'later', at: null },
    { bracket: 'main', round: 3, name: 'Final', state: 'later', at: null },
  ],
}
const bar = { id: 'tab-bar', name: 'Tablet · Bar', matchKey: null }
const stage = { id: 'tab-stage', name: 'Tablet · Stage', matchKey: 'R1M2' }
const office = { id: 'laptop', name: 'Laptop · Office', matchKey: null }

/** This browser is `device` in tournament mode, and the server says these devices are in it. */
async function mock(page: Page, device: { id: string; name: string }, devices: object[]): Promise<void> {
  await page.addInitScript(
    ([id, name]) => {
      sessionStorage.setItem('tournamentMode.deviceId', id)
      localStorage.setItem('tournamentMode.deviceName', name)
    },
    [device.id, device.name],
  )
  await page.route('**/api/tournaments/venue', r => r.fulfill({ json: tournament }))
  await page.routeWebSocket('**/ws/tournament?*', ws => {
    ws.send(JSON.stringify(state))
    ws.send(JSON.stringify({ type: 'tournament.devices', tournamentId: 'venue', devices }))
  })
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['tablet', VIEW.tablet],
] as const) {
  test(`tournament mode: matches ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page, bar, [bar, stage, office])
    await openHash(s.page, '/tournament-mode/venue')
    await expect(s.page.getByText('3 devices in tournament mode')).toBeVisible()
    await expect(s.page.getByText('X01 501 · single elimination · 8 players · Quarter-finals: 2 of 4 done')).toBeVisible()
    await expect(s.page.getByText('QF 2 · on Tablet · Stage')).toBeVisible()
    await expect(s.page.getByText('Leg 4 · Mia K. 132 left · Paul 40 left')).toBeVisible()
    await expect(s.page.getByText('Waiting for QF 2')).toBeVisible()
    // Full screen: no nav
    await expect(s.page.getByRole('navigation')).toHaveCount(0)
    await shot(s.page, `tournaments/mode-${name}.png`)
  })
}

test('tournament mode: a paused match, and leaving with a match running', async ({ browser }) => {
  // The stage tablet left: QF 2 is paused and this tablet may continue it
  const bar1 = await open(browser, 'admin', VIEW.tablet)
  await mock(bar1.page, bar, [bar, office])
  await openHash(bar1.page, '/tournament-mode/venue')
  await expect(bar1.page.getByText('PAUSED')).toBeVisible()
  await expect(bar1.page.getByRole('button', { name: 'Continue here' })).toBeVisible()
  await shot(bar1.page, 'tournaments/mode-paused-tablet.png')

  // On the stage tablet, playing QF 2: Exit says it pauses
  const s = await open(browser, 'admin', VIEW.tablet)
  await mock(s.page, stage, [bar, stage, office])
  await openHash(s.page, '/tournament-mode/venue')
  await expect(s.page.getByText('QF 2 · on this device')).toBeVisible()
  await s.page.getByRole('button', { name: 'Exit' }).click()
  await expect(s.page.getByRole('dialog', { name: 'Leave tournament mode?' })).toContainText('QF 2 is running on this device')
  await shot(s.page, 'tournaments/mode-exit-tablet.png')
})

test('tournament mode: name the device, start, and every device on the organizer page', async ({ browser }) => {
  const admin = await open(browser, 'admin', VIEW.wide)
  const mine = (await api(admin.page).get('/api/tournaments/mine')) as { organizing: { tournament: { id: string; status: string } }[] }
  for (const { tournament: t } of mine.organizing) {
    if (t.status === 'draft') await admin.page.request.delete(`/api/tournaments/${t.id}`, { headers: { Origin: BASE } })
    else if (t.status === 'open' || t.status === 'running') await api(admin.page).post(`/api/tournaments/${t.id}/cancel`)
  }
  const { name, description, access, gameId, gameConfig, format, teamSize, maxEntries, startsAt, settings } = tournament
  const t = (await api(admin.page).post('/api/tournaments', {
    name,
    description,
    access,
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

  // First open: the device is named, then the organizer starts the tournament from it
  const tablet = await open(browser, 'admin', VIEW.tablet)
  await openHash(tablet.page, `/tournament-mode/${t.id}`)
  await expect(tablet.page.getByRole('dialog', { name: 'Name this device' })).toBeVisible()
  await shot(tablet.page, 'tournaments/mode-name-tablet.png')
  await tablet.page.getByRole('textbox').fill('Tablet · Bar')
  await tablet.page.getByRole('button', { name: 'Save' }).click()
  await tablet.page.getByRole('button', { name: 'Start tournament' }).click()
  await expect(tablet.page.getByText('Quarter-finals: 0 of 4 done')).toBeVisible()

  // A second browser on the same account: both see each other within a second
  const laptop = await open(browser, 'admin', VIEW.wide)
  await laptop.page.addInitScript(() => localStorage.setItem('tournamentMode.deviceName', 'Laptop · Office'))
  await openHash(laptop.page, `/tournament-mode/${t.id}`)
  await expect(laptop.page.getByText('2 devices in tournament mode')).toBeVisible()
  await expect(tablet.page.getByText('2 devices in tournament mode')).toBeVisible({ timeout: 1_000 })

  await openHash(admin.page, `/tournaments/${t.id}/manage`)
  const card = admin.page.getByRole('region', { name: 'Devices in tournament mode' })
  await expect(card).toContainText('Tablet · Bar')
  await expect(card).toContainText('Laptop · Office')
  await admin.page.setViewportSize({ width: 1440, height: 1500 })
  await shot(admin.page, 'tournaments/mode-devices-desktop.png')

  // Leaving tournament mode takes the device off the list at once
  await laptop.page.getByRole('button', { name: 'Exit' }).click()
  await laptop.page.getByRole('button', { name: 'Leave' }).click()
  await expect(card).not.toContainText('Laptop · Office', { timeout: 1_000 })
  await expect(tablet.page.getByText('1 device in tournament mode')).toBeVisible({ timeout: 1_000 })
})
