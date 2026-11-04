import { test, expect } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The stack has no bridge connected, so the list's bridge counts and the activity are answered here
const activity = {
  bridges: [{ boardId: 'b1', boardName: 'Garage board', version: 'v0.9.0', connectedAt: '2026-11-04T08:12:00.000Z' }],
  account: {
    friends: 7,
    xp: 34_200,
    country: 'AT',
    boards: [
      { id: 'b1', name: 'Garage board' },
      { id: 'b2', name: 'Cellar board' },
    ],
  },
  games: {
    total: 142,
    last30Days: 31,
    lastAt: '2026-11-03T19:40:00.000Z',
    byMode: [
      { mode: 'x01', count: 96 },
      { mode: 'cricket', count: 30 },
      { mode: 'atc', count: 16 },
    ],
    ranked: { games: 18, ratings: [{ mode: '1v1', rating: 1480, rankIndex: 12, matches: 18 }] },
  },
  darts: { total: 9412, manual: 612, last30Days: 2210, manualLast30Days: 94 },
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  test(`admin users activity ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.route('**/api/admin/users?*', async route => {
      const res = await route.fetch()
      const body = (await res.json()) as { users: Record<string, unknown>[] }
      body.users = body.users.map((u, i) => ({ ...u, bridges: { connected: i === 0 ? 1 : 0, total: i === 0 ? 2 : 0 } }))
      await route.fulfill({ response: res, json: body })
    })
    await page.route('**/api/admin/users/*/activity', route => route.fulfill({ json: activity }))
    await page.goto('/#/admin/users')
    const toggle = page.getByRole('button', { name: /^Activity of/ }).first()
    await expect(toggle).toBeVisible()
    await shot(page, `admin-users/collapsed-${name}.png`)
    await toggle.click()
    await expect(page.getByText('Darts thrown')).toBeVisible()
    await shot(page, `admin-users/expanded-${name}.png`)
    await ctx.close()
  })
}
