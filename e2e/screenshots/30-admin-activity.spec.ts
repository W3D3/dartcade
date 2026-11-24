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
  busiestWindow: { from: '2026-10-18T19:42:10.000Z', to: '2026-11-15T19:42:10.000Z' },
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

const drill = (metric: 'signups' | 'games') => ({
  metric,
  total: metric === 'signups' ? 14 : 212,
  users:
    metric === 'signups'
      ? ['Lena', 'Marco', 'Priya', 'Tom', 'Sofia'].map((name, i) => ({ id: `u${i}`, name, at: `2026-11-14T${20 - i}:12:00.000Z` }))
      : [],
  games:
    metric === 'games'
      ? [
          { id: 'g1', mode: 'x01', at: '2026-11-14T21:40:00.000Z', players: ['Lena', 'Marco'] },
          { id: 'g2', mode: 'cricket', at: '2026-11-14T21:05:00.000Z', players: ['Priya', 'Tom'] },
          { id: 'g3', mode: 'x01', at: '2026-11-14T20:31:00.000Z', players: ['Sofia', 'Lena'] },
        ]
      : [],
})

for (const [name, view] of [
  // tall, so the page's own scroll area shows every tile in one image
  ['desktop', { ...VIEW.wide, height: 2300 }],
  ['phone', { ...VIEW.phone, height: 3600 }],
] as const) {
  test(`the activity page, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.route('**/api/admin/activity?*', r => r.fulfill({ json: activity }))
    await page.route('**/api/admin/activity/drill?*', r =>
      r.fulfill({ json: drill(new URL(r.request().url()).searchParams.get('metric') as 'games') }),
    )
    await page.goto('/#/admin/activity')
    await expect(page.getByText('Online now')).toBeVisible()
    await shot(page, `admin-activity/activity-${name}.png`)
    // a click on a bar opens what is behind it under the chart, a click on a heatmap cell the games of that hour
    await page.getByRole('img', { name: /^Games per day by mode/ }).click({ position: { x: 300, y: 120 } })
    await expect(page.getByRole('region', { name: /^Drill-down/ })).toBeVisible()
    await page.getByRole('button', { name: /^Sat 20:00,/ }).click()
    await expect(page.getByRole('region', { name: /^Drill-down: Sat 20:00/ })).toBeVisible()
    await shot(page, `admin-activity/drill-${name}.png`)
    await ctx.close()
  })
}
