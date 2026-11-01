import { test, expect } from '@playwright/test'
import { VIEW, open, shot, hostLobby, startLobbyGame, endActiveGames, X01 } from './helpers.js'

// The stack has no bridge, so the big screen's socket is given the board as online with the Board
// Manager status each shot needs. BIG_SCREEN_DIR names the docs folder, to shoot the same scenes on another build.
const DIR = process.env.BIG_SCREEN_DIR ?? 'big-screen-takeout'
const LANDSCAPE = { width: 1920, height: 1080, scale: 1 }

for (const [view, name] of [
  [LANDSCAPE, 'landscape'],
  [VIEW.monitorPortrait, 'portrait'],
] as const) {
  test(`big screen header while taking out, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', LANDSCAPE)
    const lobby = await hostLobby(page, 'Big screen lobby', X01())
    await startLobbyGame(page, lobby)
    const boards = (await (await page.request.get('/api/boards')).json()) as { boards: { id: string }[] }
    const boardId = boards.boards[0].id
    await page.setViewportSize({ width: view.width, height: view.height })

    let status = 'Takeout in progress'
    let boardName: string | undefined
    await page.routeWebSocket(/\/ws\/board/, ws => {
      const server = ws.connectToServer()
      server.onMessage(m => {
        try {
          const msg = JSON.parse(String(m))
          if (msg.type === 'big_screen')
            msg.board = {
              ...msg.board,
              online: status !== 'Offline',
              status: status === 'Offline' ? undefined : status,
            }
          // The header's name is the seats' board name in the game's snapshot
          if (boardName && msg.screen?.snapshot) for (const seat of msg.screen.snapshot.seats) seat.boardName = boardName
          ws.send(JSON.stringify(msg))
        } catch {
          ws.send(m)
        }
      })
    })
    for (const [file, s, n] of [
      ['takeout', 'Takeout in progress'],
      ['calibrating', 'Calibrating'],
      ['stopped', 'Stopped'],
      ['offline', 'Offline'],
      ['takeout-longname', 'Takeout in progress', 'Living room dartboard upstairs'],
    ] as [string, string, string?][]) {
      status = s
      boardName = n
      await page.goto(`/#/big-screen/${boardId}`)
      await page.reload()
      await expect(page.frameLocator('iframe').first().locator('body')).toBeVisible()
      await page.waitForTimeout(3500)
      await shot(page, `${DIR}/${file}-${name}.png`)
    }
    await endActiveGames(page)
    await ctx.close()
  })
}
