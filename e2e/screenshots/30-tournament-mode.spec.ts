import { test, expect, type Page } from '@playwright/test'
import { BASE, VIEW, api, open, openHash, shot } from './helpers.js'

// Tournament mode on venue devices (Tournament-Mode, Tournament-Onsite's devices card; the Exit
// artboards are superseded: a device leaves only by revoke, end or expiry). The running state is mocked like the design's quarter-finals (QF 2 live on
// another tablet, QF 3 ready, QF 1 and a forfeit done); the devices card, the pairing and the start run on
// the real server: a signed-out browser pairs with a code and keeps score.

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
    guests: null,
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
  // This browser is a signed-in organizer, not a venue device
  await page.route('**/api/tournament-device', r => r.fulfill({ status: 404, json: { error: 'not found' } }))
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

test('tournament mode: a paused match any device may continue', async ({ browser }) => {
  // The stage tablet left: QF 2 is paused and this tablet may continue it
  const bar1 = await open(browser, 'admin', VIEW.tablet)
  await mock(bar1.page, bar, [bar, office])
  await openHash(bar1.page, '/tournament-mode/venue')
  await expect(bar1.page.getByText('PAUSED')).toBeVisible()
  await expect(bar1.page.getByRole('button', { name: 'Continue here' })).toBeVisible()
  await shot(bar1.page, 'tournaments/mode-paused-tablet.png')
})

test('tournament mode: name the device, start, and every device on the organizer page', async ({ browser }) => {
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

  // The organizer starts it on their own page: tournament mode has no Start
  await openHash(admin.page, `/tournaments/${t.id}/manage`)
  await admin.page.getByRole('button', { name: 'Start tournament' }).click()
  await expect(admin.page.getByText('Quarter-finals')).toHaveCount(0)
  await expect(admin.page.getByRole('button', { name: 'Start tournament' })).toHaveCount(0)

  // Add device: a one-time code, link and QR code
  await admin.page.setViewportSize({ width: 1440, height: 1500 })
  await admin.page.getByRole('button', { name: 'Add device' }).click()
  const dialog = admin.page.getByRole('dialog', { name: 'Add a device' })
  const code = ((await dialog.getByLabel('Pairing code').textContent()) ?? '').replace(/\s/g, '')
  expect(code).toMatch(/^[A-Z2-9]{8}$/)
  await shot(admin.page, 'tournaments/device-add-desktop.png')
  await dialog.getByRole('button', { name: 'Done' }).click()

  // A tablet with no account opens the link, is named, and keeps score: nothing else is reachable
  const tablet = await open(browser, null, VIEW.tablet)
  // Opened straight from the link, once: the code works one time
  await tablet.page.goto(`/#/tournament-mode/pair/${code}`)
  await expect(tablet.page.getByRole('dialog', { name: 'Name this device' })).toBeVisible()
  await shot(tablet.page, 'tournaments/device-name-tablet.png')
  await tablet.page.getByRole('textbox').fill('Tablet · Bar')
  await tablet.page.getByRole('button', { name: 'Save' }).click()
  await expect(tablet.page.getByText('Quarter-finals: 0 of 4 done')).toBeVisible()
  await expect(tablet.page.getByRole('button', { name: /Start tournament|Exit/ })).toHaveCount(0)
  await shot(tablet.page, 'tournaments/device-mode-tablet.png')
  // The code works once; another page sends the device back to its tournament
  expect((await tablet.page.request.post('/api/tournament-devices/pair', { data: { code }, headers: { Origin: BASE } })).status()).toBe(404)
  await openHash(tablet.page, '/stats')
  await expect(tablet.page.getByText('Quarter-finals: 0 of 4 done')).toBeVisible()
  expect((await tablet.page.request.get('/api/me')).status()).toBe(403)

  // The organizer sees it, and revokes it
  await openHash(admin.page, `/tournaments/${t.id}/manage`)
  const card = admin.page.getByRole('region', { name: 'Devices' })
  await expect(card).toContainText('Tablet · Bar')
  await shot(admin.page, 'tournaments/device-list-desktop.png')
  await card.getByRole('button', { name: 'Revoke Tablet · Bar' }).click()
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click()
  await expect(card).not.toContainText('Tablet · Bar')
  await expect(tablet.page.getByText('This device was removed from the tournament')).toBeVisible({ timeout: 3_000 })
})
