import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { VIEW, open, shot, hostLobby, addBot, startLobbyGame, endActiveGames, dart, X01 } from './helpers.js'

// docs/big-screen/x01-live*.png and x01-checkout*.png: the big screen's X01 game. The stack has no bridge,
// so the socket is given the board as online and stopped, and the host's seat a board called Garage.
const LANDSCAPE = { width: 1920, height: 1080, scale: 1 }

async function mockBoard(page: Page) {
  await page.routeWebSocket(/\/ws\/board/, ws => {
    const server = ws.connectToServer()
    server.onMessage(m => {
      try {
        const msg = JSON.parse(String(m))
        if (msg.type === 'big_screen') msg.board = { ...msg.board, online: true, status: 'Stopped' }
        if (msg.screen?.snapshot) msg.screen.snapshot.seats[0].boardName = 'Garage'
        ws.send(JSON.stringify(msg))
      } catch {
        ws.send(m)
      }
    })
  })
}

for (const [scene, config, darts] of [
  ['live', { firstTo: 2 }, ['T20', 'T20', 'S5']],
  ['checkout', { startScore: 61, firstTo: 1 }, []],
] as const) {
  test(`big screen x01 ${scene}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', LANDSCAPE)
    const lobby = await hostLobby(page, 'Big screen x01', X01(config))
    await addBot(page, lobby, 2)
    await startLobbyGame(page, lobby)
    if (darts.length) await page.getByRole('button', { name: 'Enter', exact: true }).click()
    for (const d of darts) await dart(page, d)
    const boards = (await (await page.request.get('/api/boards')).json()) as { boards: { id: string }[] }
    const boardId = boards.boards[0].id
    await mockBoard(page)
    for (const [view, suffix] of [
      [LANDSCAPE, ''],
      [VIEW.monitorPortrait, '-portrait'],
    ] as const) {
      await page.setViewportSize({ width: view.width, height: view.height })
      await page.goto(`/#/big-screen/${boardId}`)
      await page.reload()
      await expect(page.frameLocator('iframe').first().locator('body')).toBeVisible()
      await page.waitForTimeout(3500)
      await shot(page, `big-screen/x01-${scene}${suffix}.png`)
    }
    await endActiveGames(page)
    await ctx.close()
  })
}
