import { test, expect } from '@playwright/test'
import type { WebSocketRoute } from '@playwright/test'
import { VIEW, X01, dart, endActiveGames, hostLobby, leaveLobby, open, shot, startLobbyGame } from './helpers.js'

// The screen after the win screen with what the game unlocked: a real solo X01 game checked out on
// D20, then the achievement.unlocked push for it, mocked (the shot database counts nothing). Without
// the push the win screen stays as it was (win-before-*).
const unlocked = [
  { id: 'x01.180', from: 2, tier: 3, count: 10, xp: 300 },
  { id: 'x01.bigFish', from: 0, tier: 1, count: 1, xp: 100 },
  { id: 'x01.bullseye', from: 1, tier: 2, count: 52, xp: 150 },
]

for (const [name, view] of [
  ['desktop', VIEW.desktop],
  ['phone', VIEW.phone],
] as const) {
  test(`achievements unlocked: ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    let me: WebSocketRoute | undefined
    await s.page.routeWebSocket(/\/ws\/me$/, ws => {
      me = ws
      const server = ws.connectToServer()
      ws.onMessage(m => server.send(m))
      server.onMessage(m => ws.send(m))
    })
    await endActiveGames(s.page)
    const lobby = await hostLobby(s.page, 'Achievements', X01({ startScore: 40, firstTo: 1 }))
    const sessionId = await startLobbyGame(s.page, lobby)
    // The header's entry toggle: "Enter" on a desktop, "Enter darts by number" on a phone
    const enter = s.page.getByRole('button', { name: /^Enter( darts by number)?$/ })
    await enter.click()
    await dart(s.page, 'D20')
    await s.page.getByRole('button', { name: 'Finish game' }).click()
    const footer = s.page.locator('footer')
    await expect(footer.getByRole('button', { name: 'Back to lobby' })).toBeVisible()
    await shot(s.page, `achievements-unlocked/win-before-${name}.png`, { settle: 1500 })

    me?.send(JSON.stringify({ type: 'achievement.unlocked', sessionId, unlocked, levelBefore: 4, levelAfter: 5 }))
    await expect(footer.getByRole('button', { name: 'Next' })).toBeVisible()
    await expect(footer.getByRole('button', { name: 'Back to lobby' })).toHaveCount(0)
    await expect(s.page.locator('.toast')).toHaveCount(0)
    await shot(s.page, `achievements-unlocked/win-next-${name}.png`, { settle: 800 })

    await footer.getByRole('button', { name: 'Next' }).click()
    await expect(s.page.getByRole('heading', { name: '3 achievements' })).toBeVisible()
    await shot(s.page, `achievements-unlocked/screen-${name}.png`, { settle: 5500, fullPage: name === 'desktop' })
    await s.page.getByRole('button', { name: 'Back to lobby' }).click()
    await expect(s.page).toHaveURL(/#\/lobby/)
    await leaveLobby(s.page)
    await s.ctx.close()
  })
}
