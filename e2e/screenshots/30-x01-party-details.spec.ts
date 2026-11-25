import { test, expect } from '@playwright/test'
import { open, shot, type View, type Who } from './helpers.js'

// The X01 details page for 2, 3 and 4 players: the breakdown sits under the results from three players
// on. Tall viewports, since the page scrolls inside its own container.
const VIEWS: Record<string, View> = {
  desktop: { width: 1440, height: 1500, scale: 1 },
  tablet: { width: 820, height: 1700, scale: 1 },
  phone: { width: 390, height: 1900, scale: 1 },
}
const SCENES: { who: Who; players: number; name: string; teams?: boolean }[] = [
  { who: 'michael', players: 2, name: 'duel' },
  { who: 'luke', players: 3, name: 'party-3' },
  { who: 'admin', players: 4, name: 'party-4' },
  { who: 'admin', players: 4, name: 'teams', teams: true },
]

for (const [label, view] of Object.entries(VIEWS)) {
  for (const scene of SCENES) {
    test(`x01 details, ${scene.name}, ${label}`, async ({ browser }) => {
      const { ctx, page } = await open(browser, scene.who, view)
      const res = await page.request.get('/api/games?mode=x01&limit=50')
      const games = (await res.json()).games as { id: string; players: unknown[]; config: { format?: string } }[]
      const game = games.find(g => g.players.length === scene.players && (g.config.format === 'teams') === !!scene.teams)
      expect(game, `a ${scene.players}-player X01 game in the seed`).toBeTruthy()
      await page.goto(`/#/stats/history/${game!.id}`)
      await expect(page.getByRole('tab', { name: 'Heatmap' })).toBeVisible()
      await shot(page, `details/x01-${scene.name}-${label}.png`, { settle: 1500 })
      await ctx.close()
    })
  }
}
