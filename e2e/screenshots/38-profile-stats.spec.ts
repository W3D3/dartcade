import { test, expect, type Page } from '@playwright/test'
import { VIEW, open, shot, openHash, userId } from './helpers.js'

// Profile: the Stats tab with a block per mode played (answers mocked: the stack has no finished
// games), the overview without the old Collection card, and the empty Stats tab.

type Tile = { id: string; label: string; value: number; format: 'int' | 'decimal' | 'percent' }
const x01: Tile[] = [
  { id: 'wins', label: 'Games won', value: 31, format: 'int' },
  { id: 'winRate', label: 'Win rate', value: 0.62, format: 'percent' },
  { id: 'average', label: '3-dart average', value: 58.4, format: 'decimal' },
  { id: 'count180', label: '180s', value: 4, format: 'int' },
  { id: 'bestCheckout', label: 'Highest checkout', value: 124, format: 'int' },
  { id: 'checkoutRate', label: 'Checkout rate', value: 0.27, format: 'percent' },
]
const MANY = [
  { mode: 'x01', games: 50, tiles: x01 },
  {
    mode: 'cricket',
    games: 18,
    tiles: [
      { id: 'wins', label: 'Games won', value: 9, format: 'int' },
      { id: 'winRate', label: 'Win rate', value: 0.5, format: 'percent' },
      { id: 'mpr', label: 'Marks per round', value: 2.1, format: 'decimal' },
      { id: 'bestMpr', label: 'Best marks per round', value: 3.4, format: 'decimal' },
    ],
  },
  {
    mode: 'catch40',
    games: 6,
    tiles: [
      { id: 'bestTotal', label: 'Best total (of 120)', value: 71, format: 'int' },
      { id: 'averageTotal', label: 'Average total', value: 52.3, format: 'decimal' },
      { id: 'checkouts', label: 'Checkouts', value: 21, format: 'int' },
    ],
  },
]

async function withStats(page: Page, modes: unknown) {
  await page.route('**/api/users/*/mode-stats', route => route.fulfill({ json: { modes } }))
}

test('profile: Stats tab per mode played, overview without the Collection card', async ({ browser }) => {
  const admin = await open(browser, 'admin', VIEW.wide)
  const luke = await open(browser, 'luke', VIEW.wide)
  const lukeId = await userId(luke.page)
  await luke.ctx.close()
  const meId = await userId(admin.page)
  await withStats(admin.page, MANY)
  await openHash(admin.page, '/profile')
  await expect(admin.page.getByRole('tab', { name: 'Stats' })).toBeVisible()
  await expect(admin.page.getByText('Collection', { exact: true })).toHaveCount(0)
  await shot(admin.page, 'profile-stats/overview-desktop.png', { settle: 1000 })
  await admin.page.getByRole('tab', { name: 'Stats' }).click()
  await expect(admin.page).toHaveURL(new RegExp(`#/profile/${meId}/stats$`))
  await expect(admin.page.getByRole('article', { name: 'Cricket stats' })).toBeVisible()
  await shot(admin.page, 'profile-stats/stats-tab-desktop.png', { settle: 1000 })
  await openHash(admin.page, `/profile/${lukeId}/stats`)
  await expect(admin.page.getByRole('article', { name: 'X01 stats' })).toBeVisible()
  await expect(admin.page.getByRole('link', { name: 'See all stats' })).toHaveCount(0)
  await shot(admin.page, 'profile-stats/stats-tab-other-desktop.png', { settle: 1000 })
  await admin.ctx.close()

  const phone = await open(browser, 'admin', VIEW.phone)
  await withStats(phone.page, MANY)
  await openHash(phone.page, '/profile')
  await expect(phone.page.getByRole('tab', { name: 'Stats' })).toBeVisible()
  await shot(phone.page, 'profile-stats/overview-phone.png', { settle: 1000 })
  await phone.page.getByRole('tab', { name: 'Stats' }).click()
  await expect(phone.page.getByRole('article', { name: 'X01 stats' })).toBeVisible()
  await shot(phone.page, 'profile-stats/stats-tab-phone.png', { settle: 1000 })
  await phone.ctx.close()

  const single = await open(browser, 'admin', VIEW.wide)
  await withStats(single.page, [MANY[2]])
  await openHash(single.page, `/profile/${await userId(single.page)}/stats`)
  await expect(single.page.getByRole('article', { name: 'Catch 40 stats' })).toBeVisible()
  await expect(single.page.getByRole('article')).toHaveCount(1)
  await shot(single.page, 'profile-stats/single-mode-desktop.png', { settle: 1000 })
  await single.ctx.close()

  const none = await open(browser, 'admin', VIEW.wide)
  await withStats(none.page, [])
  await openHash(none.page, `/profile/${await userId(none.page)}/stats`)
  await expect(none.page.getByText('No games played yet.')).toBeVisible()
  await expect(none.page.getByRole('article')).toHaveCount(0)
  await none.ctx.close()
})
