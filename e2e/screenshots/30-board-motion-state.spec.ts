import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The Boards page's Diagnostics card: the stack has no bridge, so the first board is answered online
// and the motion state is mocked. docs/board-motion-state/<scene>-<size>.png
async function online(page: Page, motion: object | null) {
  await page.route('**/api/boards', async route => {
    const res = await route.fetch()
    const body = (await res.json()) as { boards: Record<string, unknown>[] }
    body.boards = body.boards.map((b, i) =>
      i === 0 ? { ...b, online: true, bridgeVersion: 'v0.16.0', bmVersion: '0.27.3', bmReachable: true } : b,
    )
    await route.fulfill({ response: res, json: body })
  })
  await page.route(/\/api\/boards\/[^/]+\/status$/, route =>
    route.fulfill({ json: { status: 'Throw', running: true, event: 'Throw detected' } }),
  )
  await page.route(/\/api\/boards\/[^/]+\/motion$/, route => route.fulfill({ json: { motion } }))
}

for (const [view, name] of [
  [VIEW.wide, 'desktop'],
  [VIEW.phone, 'phone'],
] as const) {
  test(`Boards page Diagnostics card, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await online(page, { state: 'takeout', takeout: 'partial', since: new Date(Date.now() - 12_000).toISOString() })
    await page.goto('/#/settings/boards')
    const card = page.getByRole('region', { name: 'Diagnostics' })
    await card.scrollIntoViewIfNeeded()
    await expect(card.getByTestId('motion-state')).toHaveCount(0)
    await shot(page, `board-motion-state/collapsed-${name}.png`)
    await card.getByRole('button', { name: 'Show' }).click()
    await expect(card.getByTestId('motion-state')).toContainText('Takeout (partial)')
    await card.scrollIntoViewIfNeeded()
    await shot(page, `board-motion-state/open-${name}.png`)
    await ctx.close()
  })
}
