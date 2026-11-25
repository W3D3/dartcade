import { test, expect, type Page } from '@playwright/test'
import { open, shot, type View, type Who } from './helpers.js'

// The redesigned match details: the score on top, Statistics as the first tab (comparison bars for the
// match, or one leg) and the coach's Review tab. docs/details-redesign/<scene>-<size>-<tab>.png
const VIEWS: Record<string, View> = {
  desktop: { width: 1440, height: 1100, scale: 1 },
  tablet: { width: 820, height: 1300, scale: 1 },
  phone: { width: 390, height: 1500, scale: 1 },
}
const SCENES: { who: Who; players: number; name: string; teams?: boolean }[] = [
  { who: 'michael', players: 2, name: 'duel' },
  { who: 'luke', players: 3, name: 'party-3' },
  { who: 'admin', players: 4, name: 'teams', teams: true },
]

async function openGame(page: Page, players: number, teams: boolean): Promise<void> {
  const res = await page.request.get('/api/games?mode=x01&limit=50')
  const games = (await res.json()).games as { id: string; players: unknown[]; config: { format?: string } }[]
  const game = games.find(g => g.players.length === players && (g.config.format === 'teams') === teams)
  expect(game, `a ${players}-player X01 game in the seed`).toBeTruthy()
  await page.goto(`/#/stats/history/${game!.id}`)
  await expect(page.getByRole('tab', { name: 'Statistics' })).toBeVisible()
}

for (const [label, view] of Object.entries(VIEWS)) {
  for (const scene of SCENES) {
    test(`details redesign, ${scene.name}, ${label}`, async ({ browser }) => {
      const { ctx, page } = await open(browser, scene.who, view)
      await openGame(page, scene.players, !!scene.teams)
      await shot(page, `details-redesign/${scene.name}-${label}-statistics.png`, { settle: 1200 })
      if (scene.name === 'duel') {
        await page.getByRole('button', { name: 'Leg 1', exact: true }).click()
        await expect(page.getByRole('region', { name: 'Leg 1 statistics' })).toBeVisible()
        await shot(page, `details-redesign/${scene.name}-${label}-statistics-leg.png`, { settle: 600 })
      }
      await ctx.close()
    })
  }

  // The seed's coached game (admin against Phil): the Review tab of a game the viewer's coach can grade
  test(`details redesign, review, ${label}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    const res = await page.request.get('/api/games?mode=x01&limit=50')
    const games = (await res.json()).games as { id: string; players: { name: string }[] }[]
    const coached = games.filter(g => g.players.length === 2 && g.players.some(p => p.name === 'Phil'))
    let found = false
    for (const g of coached) {
      await page.goto(`/#/stats/history/${g.id}`)
      await expect(page.getByRole('tab', { name: 'Statistics' })).toBeVisible()
      if (await page.getByRole('tab', { name: 'Review' }).count()) {
        await page.getByRole('tab', { name: 'Review' }).click()
        await expect(page.getByRole('article').first()).toBeVisible({ timeout: 30_000 })
        found = true
        break
      }
    }
    expect(found, 'a game with a Review tab').toBe(true)
    await shot(page, `details-redesign/review-${label}.png`, { settle: 800 })
    await ctx.close()
  })
}
