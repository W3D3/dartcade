import { test, expect } from '../fixtures/auth.js'

test('boards open in settings, with the first-board guide for a new account', async ({ authedPage: page }) => {
  await page.goto('/#/boards')
  await expect(page).toHaveURL(/#\/settings\/boards$/)
  await expect(page.locator('main').getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Connect your first board' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pair', exact: true })).toBeVisible()
})

// A board that has been listening for a while: its log scrolls, the panel and page keep their height (#310, #366)
test('a long live events log scrolls inside its card', async ({ authedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const board = {
    id: 'b1',
    name: 'Living room',
    hardwareId: null,
    online: true,
    bridgeVersion: 'v0.11.0',
    bmVersion: '0.27.3',
    createdAt: '2026-10-01T18:00:00.000Z',
    ip: '192.168.0.109',
    bmUrl: 'http://192.168.0.109:3180',
    bridgeUpdate: { available: null, updatable: true },
    autoStart: true,
  }
  const event = (i: number) => ({
    at: new Date(Date.UTC(2026, 9, 26, 18, 0, i)).toISOString(),
    kind: 'dart.detected',
    data: {
      dart: { segment: { name: `T${(i % 20) + 1}`, number: (i % 20) + 1, multiplier: 3, bed: 'Triple' }, score: ((i % 20) + 1) * 3 },
    },
  })
  let count = 3
  await page.route('**/api/boards', route => route.fulfill({ json: { boards: [board] } }))
  await page.route('**/api/boards/b1/events', route =>
    route.fulfill({ json: { events: Array.from({ length: count }, (_, i) => event(i)) } }),
  )
  await page.route('**/api/boards/b1/camera/**', route => route.fulfill({ status: 404 }))

  await page.goto('/#/settings/boards')
  const panel = page.getByRole('region', { name: 'Live events' })
  const log = panel.getByRole('log')
  await expect(log.getByText('throw T3')).toBeVisible()
  const panelBefore = (await panel.boundingBox())!.height
  const pageBefore = await page.locator('main').evaluate(el => el.scrollHeight)

  count = 80
  await expect(log.getByText('throw T20')).toHaveCount(4) // the 1.5 s poll brought the long log in
  const { clientHeight, scrollHeight, scrollTop } = await log.evaluate(el => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    scrollTop: el.scrollTop,
  }))
  expect(scrollHeight).toBeGreaterThan(clientHeight)
  expect(scrollTop + clientHeight).toBeGreaterThanOrEqual(scrollHeight - 2) // pinned to the newest event
  expect((await panel.boundingBox())!.height).toBe(panelBefore)
  expect(await page.locator('main').evaluate(el => el.scrollHeight)).toBe(pageBefore)
})
