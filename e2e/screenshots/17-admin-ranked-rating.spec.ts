import { test, expect } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The stack has no bridge or ranked games, so the activity and the audit trail are answered here
const activity = {
  bridges: [],
  account: { friends: 7, xp: 34_200, country: 'AT', boards: [] },
  games: {
    total: 142,
    last30Days: 31,
    lastAt: '2026-11-03T19:40:00.000Z',
    byMode: [{ mode: 'x01', count: 142 }],
    ranked: {
      games: 18,
      ratings: [
        { mode: '1v1', rating: 1480, rankIndex: 12, matches: 18 },
        { mode: '2v2', rating: 1120, rankIndex: null, matches: 3 },
      ],
    },
  },
  darts: { total: 9412, manual: 612, last30Days: 2210, manualLast30Days: 94 },
}

const audit = {
  entries: [
    {
      id: '2',
      action: 'ranked.reset',
      target: 'u1',
      detail: { mode: '2v2', reason: 'Account was shared', before: { rating: 1120 }, after: { rating: 1120 } },
      createdAt: '2026-11-07T14:02:00.000Z',
      admin: { id: 'a', name: 'Admin' },
    },
    {
      id: '1',
      action: 'ranked.adjust',
      target: 'u1',
      detail: { mode: '1v1', reason: 'Seeded wrong after the import', before: { rating: 1210 }, after: { rating: 1480 } },
      createdAt: '2026-11-07T13:40:00.000Z',
      admin: { id: 'a', name: 'Admin' },
    },
  ],
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  test(`admin ranked rating ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.route('**/api/admin/users/*/activity', route => route.fulfill({ json: activity }))
    await page.route('**/api/admin/users/*/audit', route => route.fulfill({ json: audit }))
    await page.goto('/#/admin/users')
    await page
      .getByRole('button', { name: /^Activity of/ })
      .first()
      .click()
    await expect(page.getByText('Ranked rating')).toBeVisible()
    await page.getByText('Ranked rating').scrollIntoViewIfNeeded()
    await shot(page, `admin-ranked-rating/section-${name}.png`)
    await page.getByRole('button', { name: 'Adjust…' }).first().click()
    await page.getByLabel('Reason').fill('Seeded wrong after the import')
    await shot(page, `admin-ranked-rating/adjust-${name}.png`)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Reset…' }).last().click()
    await shot(page, `admin-ranked-rating/reset-${name}.png`)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Audit log' }).first().click()
    await expect(page.getByText('Adjusted ranked rating')).toBeVisible()
    await shot(page, `admin-ranked-rating/audit-${name}.png`)
    await ctx.close()
  })
}
