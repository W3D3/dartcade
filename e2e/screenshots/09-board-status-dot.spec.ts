import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { VIEW, open, shot, hostLobby, startLobbyGame, endGame, X01 } from './helpers.js'

// The stack has no bridge, so the first board is answered online here, with the Board Manager status
// each shot needs. BOARD_DOT_DIR names the docs folder, to shoot the same scenes on another build.
const DIR = process.env.BOARD_DOT_DIR ?? 'board-status-dot'
const STATES = [
  ['running', 'Running'],
  ['takeout', 'Takeout in progress'],
  ['calibrating', 'Calibrating'],
  ['stopped', 'Stopped'],
] as const

// The match screen reads whether a seat's board is online from the game's snapshots
async function onlineSnapshots(page: Page) {
  await page.routeWebSocket(/\/ws\?/, ws => {
    const server = ws.connectToServer()
    ws.onMessage(m => server.send(m))
    server.onMessage(m => {
      try {
        const msg = JSON.parse(String(m))
        if (msg.type === 'snapshot') for (const seat of msg.seats) seat.boardOnline = true
        ws.send(JSON.stringify(msg))
      } catch {
        ws.send(m)
      }
    })
  })
}

async function mockBoard(page: Page, status: string) {
  await page.route('**/api/boards', async route => {
    const res = await route.fetch()
    const body = (await res.json()) as { boards: Record<string, unknown>[] }
    body.boards = body.boards.map((b, i) => (i === 0 ? { ...b, online: true, bridgeVersion: 'v0.11.0', bmVersion: '0.27.3' } : b))
    await route.fulfill({ response: res, json: body })
  })
  await mockStatus(page, status)
}

async function mockStatus(page: Page, status: string) {
  await page.unroute('**/api/boards/*/status')
  await page.route('**/api/boards/*/status', route => route.fulfill({ json: { status, running: status === 'Running', event: null } }))
}

for (const [view, name] of [
  [VIEW.desktop, 'desktop'],
  [VIEW.phone, 'phone'],
] as const) {
  test(`board status dot on the match screen, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    const lobby = await hostLobby(page, 'Dot lobby', X01())
    await mockBoard(page, 'Running')
    await onlineSnapshots(page)
    await startLobbyGame(page, lobby)
    for (const [file, status] of STATES) {
      await mockStatus(page, status)
      await page.reload()
      await expect(page.getByRole('button', { name: /Board Dev Board|Dev Board/ }).first()).toBeVisible()
      await page.waitForTimeout(3500)
      await shot(page, `${DIR}/match-${file}-${name}.png`)
    }
    // End sits in the phone's menu, so end the game at desktop width for the next scene
    await page.setViewportSize({ width: VIEW.desktop.width, height: VIEW.desktop.height })
    await endGame(page)
    await ctx.close()
  })
}

test('board status dot on the Boards page, desktop', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.wide)
  await mockBoard(page, 'Takeout in progress')
  await page.goto('/#/settings/boards')
  await expect(page.getByText('Takeout in progress').first()).toBeVisible()
  await shot(page, `${DIR}/boards-takeout-desktop.png`)
  await ctx.close()
})
