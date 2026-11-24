import { test, expect } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The Games played subpage of the admin Activity page; docs/admin-activity/games-<size>.png. The answers are made up.
const DAYS = 30
const day = (i: number) => new Date(Date.UTC(2026, 9, 17 + i)).toISOString().slice(0, 10)
const perDay = Array.from({ length: DAYS }, (_, i) => ({
  day: day(i),
  count: Math.round(140 * (1 + 0.35 * Math.sin(i / 2.2) + (i % 7 >= 5 ? 0.35 : 0))),
}))
type Seat = [string, string | null]
const seats = (names: Seat[]) => names.map(([name, country], i) => ({ name, userId: `u${i}`, bot: false, country, placement: i + 1 }))
const rows: [string, string, boolean, Seat[]][] = [
  [
    'x01',
    'finished',
    true,
    [
      ['Anna', 'AT'],
      ['Dirk', 'DE'],
    ],
  ],
  [
    'cricket',
    'finished',
    false,
    [
      ['Lena', 'AT'],
      ['Mo', 'DE'],
      ['Nora', null],
    ],
  ],
  [
    'x01',
    'finished',
    false,
    [
      ['Anna', 'AT'],
      ['Arno', 'AT'],
    ],
  ],
  [
    'minigolf',
    'finished',
    false,
    [
      ['Lena', 'AT'],
      ['Dirk', 'DE'],
      ['Mo', 'DE'],
      ['Nora', null],
    ],
  ],
  ['atc', 'aborted', false, [['Dirk', 'DE']]],
  [
    'x01',
    'finished',
    true,
    [
      ['Mo', 'DE'],
      ['Lena', 'AT'],
    ],
  ],
]
const games = rows.map(([mode, status, ranked, p], i) => ({
  id: `g${i}`,
  mode,
  status,
  createdAt: new Date(Date.UTC(2026, 10, 15, 19 - i, 12)).toISOString(),
  finishedAt: status === 'finished' ? new Date(Date.UTC(2026, 10, 15, 19 - i, 40)).toISOString() : null,
  ranked,
  invalidated: false,
  players: seats(p),
}))
const body = {
  total: 4210,
  page: 1,
  pageSize: 25,
  perDay,
  games,
  users: [
    { id: 'u1', name: 'Anna' },
    { id: 'u2', name: 'Dirk' },
  ],
}

for (const [name, view] of [
  ['desktop', { ...VIEW.wide, height: 1800 }],
  ['phone', { ...VIEW.phone, height: 3000 }],
] as const) {
  test(`the games played page, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.route('**/api/admin/activity/games?**', r => r.fulfill({ json: body }))
    await page.goto('/#/admin/activity/games?users=i:u1,o:u2&countries=i:AT&match=all&players=3-4&kind=ranked&modes=x01,cricket')
    await expect(page.getByText('4 210 games')).toBeVisible()
    await shot(page, `admin-activity/games-${name}.png`)
    await ctx.close()
  })
}
