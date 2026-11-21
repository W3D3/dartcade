import { test, expect, type Page } from '@playwright/test'
import { VIEW, open, openHash, shot } from './helpers.js'

// Layout fixes #695, #696, #699: docs/layout-fixes/tournaments/<scene>-<before|after>.png. The scenes
// also assert the layout (LAYOUT_TAG=before takes the "before" shots from the old code without asserting).
const tag = process.env.LAYOUT_TAG ?? 'after'
const check = tag === 'after'
const ipad = { width: 768, height: 1024, scale: 1 }
const ipadLandscape = { width: 1024, height: 768, scale: 1 }

const NAMES = [
  'Anna-Katharina Müller',
  'Maximilian von Hohenberg',
  'Sophie-Charlotte Bauer',
  'Jule Wiesenthal',
  'Marco Pellegrini',
  'Tom Ø',
]
const tournament = {
  id: 'rr',
  name: 'Round robin night',
  kind: 'community',
  play: 'in_person',
  preselected: true,
  visibility: 'public',
  status: 'running',
  gameId: 'x01',
  gameConfig: { startScore: 501, outMode: 'double' },
  format: 'round_robin',
  teamSize: 1,
  maxEntries: 8,
  entries: NAMES.length,
  owner: { id: 'lena', name: 'Lena' },
  description: '',
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
    guests: null,
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
const liveMessage = {
  type: 'tournament.live',
  tournamentId: 'rr',
  status: 'running',
  entries: NAMES.map((name, i) => ({ id: `e${i}`, name, status: 'checked_in', seed: i + 1, finalPlace: null, players: [] })),
  matches: [],
  tables: [
    {
      group: null,
      rows: NAMES.map((_, i) => ({ entryId: `e${i}`, played: 5 - i, won: 5 - i, lost: i, legsWon: 12 - i, legsLost: i * 2 })),
    },
  ],
  schedule: [],
}

test('standings at 320: names truncate, numbers keep their columns', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.narrowPhone)
  await s.page.route('**/api/tournaments/rr', r => r.fulfill({ json: tournament }))
  await s.page.routeWebSocket('**/ws/tournament?*', ws => ws.send(JSON.stringify(liveMessage)))
  await openHash(s.page, '/tournaments/rr')
  await expect(s.page.getByText('Anna-Katharina Müller').first()).toBeVisible()
  if (check) {
    const rows = s.page.locator('table tbody tr')
    for (let i = 0; i < (await rows.count()); i++) {
      const row = rows.nth(i)
      const name = (await row.locator('td').nth(1).locator('span.truncate').boundingBox())!
      const played = (await row.locator('td').nth(2).boundingBox())!
      expect(name.x + name.width, `row ${i} name ends before P`).toBeLessThanOrEqual(played.x + 0.5)
      expect(played.width, `row ${i} P keeps its column`).toBeGreaterThanOrEqual(30)
    }
  }
  await shot(s.page, `layout-fixes/tournaments/standings-320-${tag}.png`)
})

const community = (i: number) => ({
  id: `t${i}`,
  kind: 'community',
  play: 'online',
  preselected: false,
  visibility: 'public',
  status: 'open',
  gameId: 'x01',
  gameConfig: { startScore: 501, outMode: 'double' },
  format: 'single_elimination',
  teamSize: 1,
  owner: { id: `p${i}`, name: `player0${i}9` },
  registration: 'open',
  avgLimit: null,
  eligibility: null,
  name: `Open community cup ${i}`,
  maxEntries: 64,
  entries: 12 + i,
  startsAt: `2026-11-2${i}T19:00:00Z`,
})

for (const [name, view] of [
  ['768', ipad],
  ['1024', ipadLandscape],
] as const) {
  test(`browse at ${name}: the organizer line stays in its column`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await s.page.route('**/api/tournaments', r => r.fulfill({ json: { tournaments: [1, 2, 3, 4].map(community) } }))
    await openHash(s.page, '/tournaments/browse')
    await expect(s.page.getByText('Open community cup 1').locator('visible=true')).toBeVisible()
    if (check) {
      const lines = s.page.locator('span[title^="by player"]').locator('visible=true')
      for (let i = 0; i < (await lines.count()); i++) {
        const line = (await lines.nth(i).boundingBox())!
        const next = (await lines
          .nth(i)
          .locator('xpath=ancestor::div[contains(@class,"flex-col")][1]/following-sibling::div[1]')
          .boundingBox())!
        expect(line.x + line.width, `row ${i} organizer line ends before the format column`).toBeLessThanOrEqual(next.x + 0.5)
      }
    }
    await shot(s.page, `layout-fixes/tournaments/browse-${name}-${tag}.png`)
  })
}

for (const [name, view] of [
  ['768', ipad],
  ['1024', ipadLandscape],
] as const) {
  test(`matchmaking at ${name}: the Duo card's description and hint do not overlap`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await openHash(s.page, '/matchmaking')
    const duo = s.page.getByRole('radio', { name: /Duo · 2v2/ })
    await expect(duo).toBeVisible()
    if (check) {
      const line = (await duo.getByText('You and one lobby mate vs another duo').boundingBox())!
      const hint = (await s.page.getByText('Needs a lobby of exactly 2').boundingBox())!
      expect(hint.y, 'hint sits below the description').toBeGreaterThanOrEqual(line.y + line.height - 0.5)
    }
    await shot(s.page, `layout-fixes/tournaments/matchmaking-${name}-${tag}.png`)
  })
}
