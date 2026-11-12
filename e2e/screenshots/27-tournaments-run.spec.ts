import { test, expect, type Page } from '@playwright/test'
import { VIEW, open, openHash, shot } from './helpers.js'

// Running an online tournament, from mocked answers: Details during the check-in (Check in), an
// organizer's tournament without a start time (Start now), and the "Your match is on" toast pushed
// on /ws/me when a match's game starts.
const settings = {
  seeding: 'rating',
  firstTo: 3,
  longerFinal: null,
  groups: null,
  registrationClosesMinutes: null,
  checkInMinutes: 5,
  plannedFor: null,
  manualScoring: false,
  noShowMinutes: 10,
}
const base = {
  kind: 'community',
  access: 'friends',
  gameId: 'x01',
  gameConfig: { startScore: 501, outMode: 'double' },
  format: 'single_elimination',
  teamSize: 1,
  maxEntries: 8,
  entries: 8,
  owner: { id: 'lena', name: 'Lena' },
  description: 'Our Thursday knockout. First to 3, double out.',
  settings,
  locked: true,
  createdAt: '2026-11-01T10:00:00Z',
  publishedAt: '2026-11-01T10:00:00Z',
  registrationClosesAt: null,
  inviteCode: null,
  friendsIn: ['Lena', 'Max'].map(name => ({ id: name.toLowerCase(), name, avatar: { kind: 'none' } })),
  checkedIn: false,
}
const checkIn = {
  ...base,
  id: 'thursday',
  name: 'Thursday Knockout',
  status: 'check_in',
  startsAt: '2026-11-12T19:05:00Z',
  role: null,
  registration: 'registered',
}
const organizing = {
  ...base,
  id: 'club',
  name: 'Club Night Cup',
  owner: { id: 'admin', name: 'Admin' },
  status: 'open',
  entries: 6,
  startsAt: null,
  role: 'owner',
  registration: 'open',
  locked: true,
}
const summary = (t: typeof checkIn | typeof organizing) => ({
  id: t.id,
  name: t.name,
  kind: t.kind,
  access: t.access,
  status: t.status,
  gameId: t.gameId,
  gameConfig: t.gameConfig,
  format: t.format,
  teamSize: t.teamSize,
  maxEntries: t.maxEntries,
  entries: t.entries,
  startsAt: t.startsAt,
  owner: t.owner,
  registration: t.registration,
})

async function mock(page: Page) {
  await page.route('**/api/tournaments', r => r.fulfill({ json: { tournaments: [summary(checkIn), summary(organizing)] } }))
  await page.route('**/api/tournaments/thursday', r => r.fulfill({ json: checkIn }))
  await page.route('**/api/tournaments/club', r => r.fulfill({ json: organizing }))
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  test(`tournaments run: check in ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page)
    await openHash(s.page, '/tournaments/browse')
    await s.page.getByText('Thursday Knockout').locator('visible=true').click()
    await expect(s.page.getByText("You're registered")).toBeVisible()
    await shot(s.page, `tournaments/run-check-in-${name}.png`)
  })

  test(`tournaments run: start now ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page)
    await openHash(s.page, '/tournaments/browse')
    await s.page.getByText('Club Night Cup').locator('visible=true').click()
    await expect(s.page.getByRole('dialog').getByText('An organizer starts it', { exact: true })).toBeVisible()
    await shot(s.page, `tournaments/run-start-${name}.png`)
  })

  test(`tournaments run: match on ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page)
    // The game's start is pushed on /ws/me; the rest of the page needs nothing from it here
    await s.page.routeWebSocket('**/ws/me', ws => {
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            type: 'tournament.match',
            tournamentId: 'thursday',
            tournamentName: 'Thursday Knockout',
            sessionId: 'game-1',
            opponent: 'Max',
          }),
        )
      }, 1500)
    })
    await openHash(s.page, '/tournaments/browse')
    await expect(s.page.getByText('Your match is on')).toBeVisible()
    await shot(s.page, `tournaments/run-match-on-${name}.png`)
  })
}
