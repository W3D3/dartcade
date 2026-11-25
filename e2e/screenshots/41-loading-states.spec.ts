import { test, expect, type Page } from '@playwright/test'
import { open } from './helpers.js'

// The loading screens against a real backend with the API held back 0, 1, 3 and 8 s (under the
// 12 s timeout): the indicator shows while it waits, the loaded page follows, and no error state
// (a Vite overlay, a console error, a failed API call, "taking longer than usual") appears on the
// way. A 13 s hold is the one that must show the timeout and its Retry.

const VIEWS = {
  desktop: { width: 1080, height: 675, scale: 1 },
  phone: { width: 390, height: 844, scale: 1 },
} as const
const DELAYS = [0, 1000, 3000, 8000]

function watch(page: Page) {
  const problems: string[] = []
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`))
  page.on('console', m => m.type() === 'error' && problems.push(`console: ${m.text()}`))
  page.on('response', r => r.url().includes('/api/') && r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`))
  return problems
}

async function hold(page: Page, patterns: string[], ms: number) {
  for (const pattern of patterns)
    await page.route(pattern, async route => {
      if (ms > 0 && route.request().method() === 'GET') await new Promise(r => setTimeout(r, ms))
      await route.continue().catch(() => undefined)
    })
}

const noErrorState = async (page: Page) => {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await expect(page.getByText('This is taking longer than usual.')).toHaveCount(0)
}

for (const [view, size] of Object.entries(VIEWS)) {
  for (const ms of DELAYS) {
    test(`boot ${view} held ${ms} ms`, async ({ browser }) => {
      const { ctx, page } = await open(browser, 'admin', size)
      const problems = watch(page)
      await hold(page, ['**/api/me', '**/api/auth/get-session'], ms)
      await page.goto('/#/')
      if (ms >= 1000) {
        await expect(page.getByRole('status').filter({ hasText: 'Loading Dartcade' })).toBeVisible()
        await noErrorState(page)
      }
      await expect(page.locator('#boot')).toHaveCount(0)
      await expect(page.getByRole('status').filter({ hasText: 'Loading Dartcade' })).toHaveCount(0, { timeout: ms + 10_000 })
      await noErrorState(page)
      expect(problems).toEqual([])
      await ctx.close()
    })

    test(`history ${view} held ${ms} ms`, async ({ browser }) => {
      const { ctx, page } = await open(browser, 'admin', size)
      await page.goto('/#/')
      await page.waitForLoadState('networkidle')
      const problems = watch(page)
      await hold(page, ['**/api/games', '**/api/games?*'], ms)
      await page.goto('/#/history')
      await page.reload()
      if (ms >= 1000) {
        await expect(page.getByRole('status').filter({ hasText: 'Loading matches' })).toBeVisible()
        await noErrorState(page)
      }
      await expect(page.getByRole('status').filter({ hasText: 'Loading matches' })).toHaveCount(0, { timeout: ms + 10_000 })
      await expect(page.getByRole('link', { name: /details/ }).first()).toBeVisible()
      await noErrorState(page)
      expect(problems).toEqual([])
      await ctx.close()
    })
  }
}

test('a 13 s hold shows the timeout with Retry, and nothing sooner', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEWS.desktop)
  await page.goto('/#/')
  await page.waitForLoadState('networkidle')
  await hold(page, ['**/api/games', '**/api/games?*'], 13_500)
  await page.goto('/#/history')
  await page.reload()
  await page.waitForTimeout(6000)
  await noErrorState(page)
  await expect(page.getByText('This is taking longer than usual.')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await ctx.close()
})
