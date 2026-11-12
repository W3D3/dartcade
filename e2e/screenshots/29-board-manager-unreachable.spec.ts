import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The stack has no bridge: the first board is answered online, and every Board Manager call through
// it fails as when the bridge cannot reach its Board Manager (502). BM_UNREACHABLE_DIR names the docs
// folder, to shoot the same scenes on another build.
const DIR = process.env.BM_UNREACHABLE_DIR ?? 'board-manager-unreachable'

async function unreachable(page: Page) {
  await page.route('**/api/boards', async route => {
    const res = await route.fetch()
    const body = (await res.json()) as { boards: Record<string, unknown>[] }
    body.boards = body.boards.map((b, i) => (i === 0 ? { ...b, online: true, bridgeVersion: 'v0.13.0', bmVersion: '0.27.3' } : b))
    await route.fulfill({ response: res, json: body })
  })
  await page.route(/\/api\/boards\/[^/]+\/(status|start|stop|reset|calibrate)$/, route =>
    route.fulfill({ status: 502, json: { error: 'Board Manager request failed' } }),
  )
}

for (const [view, name] of [
  [VIEW.wide, 'desktop'],
  [VIEW.phone, 'phone'],
] as const) {
  test(`Boards page with the Board Manager not reachable, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await unreachable(page)
    await page.goto('/#/settings/boards')
    await expect(page.getByText('connected').first()).toBeVisible()
    await page.waitForTimeout(3500)
    await shot(page, `${DIR}/boards-${name}.png`)
    await page.getByRole('button', { name: 'Start' }).first().click()
    await page.waitForTimeout(1000)
    await shot(page, `${DIR}/boards-command-failed-${name}.png`, { keepToasts: true })
    await ctx.close()
  })
}
