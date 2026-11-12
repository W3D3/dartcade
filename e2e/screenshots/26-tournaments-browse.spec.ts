import { test, expect, type Page } from '@playwright/test'
import { VIEW, open, openHash, shot } from './helpers.js'

// Browse with tournaments (Tournaments, Tournaments-Phone boards) and a tournament's Details, from
// mocked answers: official and community tournaments, one you are in, one full, one needing a board,
// one with a team average limit and one whose average limit you are above.
const settings = {
  seeding: 'random',
  firstTo: 3,
  longerFinal: null,
  groups: null,
  registrationClosesMinutes: 60,
  checkInMinutes: 30,
  plannedFor: null,
  manualScoring: false,
  noShowMinutes: 10,
  avgLimit: null,
}
const base = {
  kind: 'community',
  access: 'public',
  status: 'open',
  gameId: 'x01',
  gameConfig: { startScore: 501, outMode: 'double' },
  format: 'single_elimination',
  teamSize: 1,
  owner: null,
  registration: 'open',
  avgLimit: null,
  eligibility: null,
}
const limit = { min: null, max: null, teams: 'every', minLegs: 20, lock: true }
const tournaments = [
  {
    ...base,
    id: 'doubles',
    kind: 'official',
    name: 'November Doubles Cup',
    teamSize: 2,
    format: 'double_elimination',
    maxEntries: 32,
    entries: 27,
    startsAt: '2026-11-15T19:00:00Z',
    registration: 'team',
    avgLimit: { ...limit, min: 55, teams: 'team' },
    eligibility: { eligible: true, reason: null, average: 68.4 },
  },
  {
    ...base,
    id: 'cricket',
    kind: 'official',
    name: 'Cricket Night',
    gameId: 'cricket',
    gameConfig: {},
    maxEntries: 32,
    entries: 12,
    startsAt: '2026-11-19T18:30:00Z',
  },
  {
    ...base,
    id: 'living',
    name: 'Living Room Classic',
    access: 'friends',
    owner: { id: 'lena', name: 'Lena' },
    status: 'running',
    maxEntries: 8,
    entries: 8,
    startsAt: '2026-11-12T19:00:00Z',
    registration: 'registered',
  },
  {
    ...base,
    id: 'league',
    name: 'Friday Darts League',
    access: 'invite',
    owner: { id: 'max', name: 'Max' },
    gameConfig: { startScore: 301 },
    format: 'round_robin',
    maxEntries: 8,
    entries: 8,
    startsAt: '2026-11-14T19:00:00Z',
    registration: 'full',
  },
  {
    ...base,
    id: 'beginners',
    name: 'Beginners Welcome Cup',
    owner: { id: 'pia', name: 'Pia' },
    gameConfig: { startScore: 301 },
    maxEntries: 16,
    entries: 5,
    startsAt: '2026-11-29T17:00:00Z',
    registration: 'not_eligible',
    avgLimit: { ...limit, max: 45 },
    eligibility: { eligible: false, reason: 'above', average: 68.4 },
  },
]
const detail = {
  ...tournaments[1],
  description: 'Standard cricket, first to 3 legs. Bring your own board.',
  settings,
  role: null,
  locked: true,
  createdAt: '2026-11-01T10:00:00Z',
  publishedAt: '2026-11-01T10:00:00Z',
  registrationClosesAt: '2026-11-19T17:30:00Z',
  inviteCode: null,
  friendsIn: ['Lena', 'Max', 'Anna', 'Tom'].map(name => ({ id: name.toLowerCase(), name, avatar: { kind: 'none' } })),
}

async function mock(page: Page) {
  await page.route('**/api/tournaments', r => r.fulfill({ json: { tournaments } }))
  await page.route('**/api/tournaments/cricket', r => r.fulfill({ json: detail }))
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  test(`tournaments browse: list ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page)
    await openHash(s.page, '/tournaments/browse')
    await expect(s.page.getByText('Cricket Night').locator('visible=true')).toBeVisible()
    await shot(s.page, `tournaments/browse-list-${name}.png`)
  })

  test(`tournaments browse: not eligible ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page)
    await openHash(s.page, '/tournaments/browse')
    const row = s.page.getByText('Beginners Welcome Cup').locator('visible=true')
    await row.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await expect(s.page.getByText(/Your Ø 68.4 · max 45/).locator('visible=true')).toBeVisible()
    await shot(s.page, `tournaments/browse-not-eligible-${name}.png`)
  })

  test(`tournaments browse: details ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page)
    await openHash(s.page, '/tournaments/browse')
    await s.page.getByText('Cricket Night').locator('visible=true').click()
    await expect(s.page.getByText('Lena, Max and 2 friends are in')).toBeVisible()
    await shot(s.page, `tournaments/browse-details-${name}.png`)
  })
}
