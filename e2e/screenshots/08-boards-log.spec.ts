import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The stack has no bridge, so a board that has been listening for a while is answered here: the first
// board online, with 80 throws in its live events log
async function longLog(page: Page) {
  await page.route('**/api/boards', async route => {
    const res = await route.fetch()
    const body = (await res.json()) as { boards: Record<string, unknown>[] }
    body.boards = body.boards.map((b, i) => (i === 0 ? { ...b, online: true, bridgeVersion: 'v0.11.0', bmVersion: '0.27.3' } : b))
    await route.fulfill({ response: res, json: body })
  })
  const events = Array.from({ length: 80 }, (_, i) => {
    const n = (i % 20) + 1
    return {
      at: new Date(Date.UTC(2026, 9, 26, 17, 0, i * 7)).toISOString(),
      kind: i % 4 === 3 ? 'takeout.started' : 'dart.detected',
      data: i % 4 === 3 ? {} : { dart: { segment: { name: `T${n}`, number: n, multiplier: 3, bed: 'Triple' }, score: n * 3 } },
    }
  })
  await page.route('**/api/boards/*/events', route => route.fulfill({ json: { events } }))
}

test('long live events log', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.wide)
  await longLog(page)
  await page.goto('/#/settings/boards')
  await expect(page.getByText('throw T19').first()).toBeVisible()
  await page.getByRole('button', { name: 'Play on this board' }).scrollIntoViewIfNeeded()
  await shot(page, 'boards-log-height/fixed.png')
  await ctx.close()
})

test('long live events log on a phone', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.phone)
  await longLog(page)
  await page.goto('/#/settings/boards')
  await expect(page.getByText('throw T19').first()).toBeVisible()
  await page.getByText('Live events').scrollIntoViewIfNeeded()
  await shot(page, 'boards-log-height/phone.png')
  await ctx.close()
})
