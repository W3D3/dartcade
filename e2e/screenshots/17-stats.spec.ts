import fs from 'fs'
import { test, expect, type Page } from '@playwright/test'
import { VIEW, docPath, open, shot } from './helpers.js'

// The Stats page as Admin sees it (stats.enabled is on for admins), its numbers mocked: a real
// answer of GET /api/stats/x01 (stats-x01.json, from the preview seed plus 40 more X01 games), an
// empty one, a failed one and one that never comes (loading).

const FILLED = JSON.parse(fs.readFileSync(new URL('./stats-x01.json', import.meta.url), 'utf8')) as Record<string, unknown>
const EMPTY = {
  ...FILLED,
  options: { starts: [], outModes: [] },
  applied: { range: 'legs50', start: null, out: null, kind: 'all' },
  totalLegs: 0,
  window: { legs: 0, from: null, to: null },
  before: null,
}

type Answer = 'filled' | 'empty' | 'error' | 'loading'
async function mock(page: Page, answer: Answer) {
  await page.route('**/api/stats/x01*', route => {
    if (answer === 'loading') return
    if (answer === 'error') return route.fulfill({ status: 500, json: { error: 'internal' } })
    return route.fulfill({ json: answer === 'filled' ? FILLED : EMPTY })
  })
}

test('stats page', async ({ browser }) => {
  for (const [view, file] of [
    [{ ...VIEW.wide, height: 2550 }, 'stats/stats-desktop.png'],
    [{ ...VIEW.tabletPortrait, height: 3700 }, 'stats/stats-tablet.png'],
    [{ ...VIEW.phone, height: 5800 }, 'stats/stats-phone.png'],
    [{ ...VIEW.smallPhone, height: 6200 }, 'stats/stats-phone-360.png'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await mock(page, 'filled')
    await page.goto('/#/stats')
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
    await shot(page, file)
    await ctx.close()
  }
})

test('stats doubles on the board', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.wide)
  await mock(page, 'filled')
  await page.goto('/#/stats')
  await page.getByRole('button', { name: 'Board' }).click()
  const doubles = page.getByRole('region', { name: 'Your doubles' })
  await doubles.scrollIntoViewIfNeeded()
  await page.evaluate(() => document.fonts.ready)
  await doubles.screenshot({ path: docPath('stats/stats-doubles-board.png'), animations: 'disabled' })
  await ctx.close()
})

test('stats states', async ({ browser }) => {
  for (const answer of ['empty', 'error', 'loading'] as const) {
    for (const [view, size] of [
      [VIEW.desktop, 'desktop'],
      [VIEW.phone, 'phone'],
    ] as const) {
      const { ctx, page } = await open(browser, 'admin', view)
      await mock(page, answer)
      await page.goto('/#/stats')
      if (answer === 'empty') await expect(page.getByText('No stats yet')).toBeVisible()
      if (answer === 'error') await expect(page.getByRole('alert')).toBeVisible()
      if (answer === 'loading') {
        await expect(page.locator('[aria-busy="true"]')).toBeVisible()
        await page.waitForTimeout(500)
        await page.screenshot({ path: docPath(`stats/stats-${answer}-${size}.png`), animations: 'disabled' })
      } else await shot(page, `stats/stats-${answer}-${size}.png`)
      await ctx.close()
    }
  }
})
