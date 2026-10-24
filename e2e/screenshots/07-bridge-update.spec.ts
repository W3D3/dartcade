import { test, expect } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The stack has no bridge and no signed release to offer, so the board list is answered here: the
// first board online on an older bridge, with a newer one on offer
test('update bridge', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.wide)
  await page.route('**/api/boards', async route => {
    const res = await route.fetch()
    const body = (await res.json()) as { boards: Record<string, unknown>[] }
    body.boards = body.boards.map((b, i) =>
      i === 0
        ? {
            ...b,
            online: true,
            bridgeVersion: 'v0.9.0',
            bmVersion: '0.27.3',
            bridgeUpdate: { available: 'v0.9.1', updatable: true },
          }
        : b,
    )
    await route.fulfill({ response: res, json: body })
  })
  await page.route('**/api/boards/*/bridge-update', route =>
    route.fulfill({ status: 202, json: { version: 'v0.9.1', phase: 'downloading', error: null } }),
  )
  await page.goto('/#/settings/boards')
  const button = page.getByRole('button', { name: 'Update bridge' })
  await expect(button).toBeVisible()
  await shot(page, 'bridge-update/available-desktop.png')

  await button.click()
  await expect(page.getByRole('status').filter({ hasText: 'Downloading v0.9.1' })).toBeVisible()
  await shot(page, 'bridge-update/updating-desktop.png')
  await ctx.close()
})
