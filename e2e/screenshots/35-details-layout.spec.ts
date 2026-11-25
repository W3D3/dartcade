import { test, expect } from '@playwright/test'
import { checkLayout, useLongNames } from '../fixtures/detailsLayout.js'
import { open, shot, type View, type Who } from './helpers.js'

// Match details on every size the visual QA sweep looked at: the score hero shows the names, the
// cricket Final marks headers sit over their own columns and the X01 visit cells never run into each other.
const VIEWS: Record<string, View> = {
  'phone-390': { width: 390, height: 1400, scale: 1 },
  'phone-landscape': { width: 844, height: 390, scale: 1 },
  'ipad-portrait': { width: 768, height: 1024, scale: 1 },
  'ipad-landscape': { width: 1024, height: 768, scale: 1 },
  laptop: { width: 1280, height: 800, scale: 1 },
  'zoom-150': { width: 853, height: 540, scale: 1.5 },
  desktop: { width: 1920, height: 1080, scale: 1 },
}
const SCENES: { who: Who; mode: string; players: number; name: string }[] = [
  { who: 'michael', mode: 'x01', players: 2, name: 'x01-2' },
  { who: 'admin', mode: 'x01', players: 4, name: 'x01-4' },
  { who: 'admin', mode: 'cricket', players: 3, name: 'cricket-3' },
  { who: 'admin', mode: 'minigolf', players: 2, name: 'golf-2' },
]
// The dev server compiles a page on its first visit, which can outlast a load wait
test.describe.configure({ retries: 2 })

for (const [label, view] of Object.entries(VIEWS)) {
  for (const scene of SCENES) {
    for (const long of [false, true]) {
      test(`details layout, ${scene.name}, ${label}${long ? ', long names' : ''}`, async ({ browser }) => {
        const { ctx, page } = await open(browser, scene.who, view)
        const res = await page.request.get(`/api/games?mode=${scene.mode}&limit=50`)
        const games = (await res.json()).games as { id: string; players: { name: string }[] }[]
        const game = games.find(g => g.players.length === scene.players)
        expect(game, `a ${scene.players}-player ${scene.mode} game in the seed`).toBeTruthy()
        if (long) await useLongNames(page, game!.id)
        await page.goto(`/#/stats/history/${game!.id}`)
        await expect(page.locator('section[aria-label="Result"], main').first()).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(1500)
        if (!long) await shot(page, `layout-fixes/details/${scene.name}-${label}.png`, { settle: 300 })
        await checkLayout(page, long)
        await ctx.close()
      })
    }
  }
}
