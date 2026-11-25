import { test, expect, type Page } from '@playwright/test'
import { docPath, open } from './helpers.js'

// What each screen shows while its data is on the way: the API is held back for 8 seconds and the
// page shot once the loading indicator is up, then (SHOTS_SET=after) again when it has loaded.
// Run it on the old code with SHOTS_SET=before, on the new with SHOTS_SET=after: same names, a
// before/after pair in docs/loading-screens/.

const SET = process.env.SHOTS_SET === 'before' ? 'before' : 'after'
const HOLD_MS = 8000
const VIEWS = {
  desktop: { width: 1080, height: 675, scale: 1 },
  phone: { width: 390, height: 844, scale: 1 },
} as const

// An "after" image must show the loading or the loaded state, never an error: no dev overlay and no timeout message
const jpg = async (page: Page, name: string, view: string) => {
  if (SET === 'after') {
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    await expect(page.getByText('This is taking longer than usual.')).toHaveCount(0)
  }
  await page.screenshot({
    path: docPath(`loading-screens/${name}-${view}-${SET}.jpg`),
    type: 'jpeg',
    quality: 72,
    animations: 'disabled',
    caret: 'hide',
  })
}

type Scene = { name: string; hash: string; hold: string[]; ready: (page: Page) => Promise<void>; who?: 'admin' | 'luke' }
const SCENES: Scene[] = [
  {
    name: 'history',
    hash: '/#/history',
    hold: ['**/api/games?*', '**/api/games'],
    ready: p => expect(p.getByRole('heading', { name: 'History' }).first()).toBeVisible(),
  },
  {
    name: 'stats',
    hash: '/#/stats',
    hold: ['**/api/stats/x01*'],
    ready: p => expect(p.getByRole('heading', { name: 'Overview' })).toBeVisible(),
  },
  {
    name: 'boards',
    hash: '/#/settings/boards',
    hold: ['**/api/boards'],
    ready: p => expect(p.locator('[aria-busy="true"]')).toHaveCount(0),
  },
  {
    name: 'admin-games',
    hash: '/#/admin/games',
    hold: ['**/api/admin/games*'],
    ready: p => expect(p.getByRole('heading', { name: /games/i }).first()).toBeVisible(),
  },
  {
    name: 'tournaments',
    hash: '/#/tournaments',
    hold: ['**/api/tournaments?*', '**/api/tournaments'],
    ready: p => expect(p.getByRole('heading', { name: /Tournaments/ }).first()).toBeVisible(),
  },
  { name: 'friends', hash: '/#/friends', hold: [], ready: p => expect(p.getByRole('heading', { name: /Friends/ }).first()).toBeVisible() },
]

async function hold(page: Page, patterns: string[]) {
  for (const pattern of patterns) {
    await page.route(pattern, async route => {
      if (route.request().method() !== 'GET') return route.continue()
      await new Promise(r => setTimeout(r, HOLD_MS))
      await route.continue().catch(() => undefined)
    })
  }
}

for (const [view, size] of Object.entries(VIEWS)) {
  test(`boot ${view}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', size)
    await hold(page, ['**/api/me', '**/api/auth/get-session'])
    await page.goto('/#/')
    await page.waitForTimeout(1200)
    await jpg(page, 'boot', view)
    await ctx.close()
  })

  for (const scene of SCENES) {
    test(`${scene.name} ${view}`, async ({ browser }) => {
      const { ctx, page } = await open(browser, scene.who ?? 'admin', size)
      // Warm the app first, so only this screen's own data is held back
      await page.goto('/#/')
      await page.waitForLoadState('networkidle')
      await hold(page, scene.hold)
      if (scene.name === 'friends') {
        await page.routeWebSocket('**/ws/me', () => undefined)
      }
      await page.goto(scene.hash)
      await page.reload()
      await page.waitForTimeout(1500)
      await jpg(page, scene.name, view)
      if (SET === 'after') {
        await ctx.close()
        const again = await open(browser, scene.who ?? 'admin', size)
        await again.page.goto(scene.hash)
        await scene.ready(again.page)
        await again.page.waitForLoadState('networkidle').catch(() => undefined)
        await again.page.screenshot({
          path: docPath(`loading-screens/${scene.name}-${view}-loaded.jpg`),
          type: 'jpeg',
          quality: 72,
          animations: 'disabled',
        })
        await again.ctx.close()
      } else await ctx.close()
    })
  }
}
