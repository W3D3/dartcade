import { test, expect } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The admin Activity page; docs/admin-activity/<scene>-<size>.png. The stack has next to no traffic,
// so what the page reads is answered here with a month of made-up numbers.
const DAYS = 30
const wave = (base: number, i: number) => Math.round(base * (1 + 0.35 * Math.sin(i / 2.2) + (i % 7 >= 5 ? 0.35 : 0)))
const perDay = Array.from({ length: DAYS }, (_, i) => ({
  x01: wave(210, i),
  cricket: wave(60, i),
  minigolf: wave(42, i),
  atc: wave(24, i),
}))
const busiest = Array.from({ length: 7 }, (_, d) =>
  Array.from({ length: 24 }, (_, h) =>
    Math.max(0, Math.round((d >= 5 ? 14 : 8) * Math.exp(-(((h - 20.5) / 3.2) ** 2)) + (h > 9 && h < 18 ? 2 : 0))),
  ),
)

const activity = {
  generatedAt: '2026-11-15T19:42:10.000Z',
  days: DAYS,
  live: { online: 128, runningGames: 31 },
  last24h: { players: 940, games: 612, oneEighties: 87 },
  newUsers: { last7d: 79, previous7d: 67 },
  newUsersPerDay: Array.from({ length: DAYS }, (_, i) => wave(9, i)),
  gamesPerDay: { modes: ['x01', 'cricket', 'minigolf', 'atc'], perDay },
  busiest,
  happeningNow: {
    tournaments: [
      { id: 't1', name: 'Midweek Masters #12', official: true, status: 'running', entries: 64 },
      { id: 't2', name: 'Living Room Classic', official: false, status: 'check_in', entries: 8 },
    ],
    rankedQueue: 18,
    openLobbies: 6,
    runningGames: { x01: 17, cricket: 8, minigolf: 4, atc: 2 },
  },
  health: { bridges: 42, boardsOnline: 40, manualDartShare: 0.11 },
  highlights: { achievementsUnlocked24h: 2140, teamsCreated7d: 8 },
}

for (const [name, view] of [
  // tall, so the page's own scroll area shows every tile in one image
  ['desktop', { ...VIEW.wide, height: 1900 }],
  ['phone', { ...VIEW.phone, height: 3000 }],
] as const) {
  test(`the activity page, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.route('**/api/admin/activity**', r => r.fulfill({ json: activity }))
    await page.goto('/#/admin/activity')
    await expect(page.getByText('Online now')).toBeVisible()
    await shot(page, `admin-activity/activity-${name}.png`)
    await ctx.close()
  })
}
