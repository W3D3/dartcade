import { test } from '@playwright/test'
import { VIEW, open, shot, endActiveGames } from './helpers.js'

// The accept window of a found ranked match is 60 s: the countdown reads m:ss and the bar drains over
// the match's acceptSeconds. The stack has no queue, so the `matchmaking` message on /ws/me is mocked.
const DIR = 'matchmaking-accept'
const SECOND = 1000

const views = [
  ['desktop', VIEW.wide],
  ['phone-390', VIEW.phone],
  ['phone-360', VIEW.smallPhone],
] as const

for (const [name, view] of views) {
  for (const [left, label] of [
    [60, 'full'],
    [9, 'low'],
  ] as const) {
    test(`the found match with ${left} s left, ${name}`, async ({ browser }) => {
      const { ctx, page } = await open(browser, 'admin', view)
      await endActiveGames(page)
      const me = (await (await page.request.get('/api/me')).json()) as { id: string }
      // the shot lands about 3 s from now, so the clock then reads `left`
      const shotAt = Date.now() + 3 * SECOND
      const seat = (you: boolean) => ({ person: null, accepted: false, you })
      const state = () => ({
        search: {
          mode: '1v1',
          firstTo: 2,
          since: new Date(Date.now() - 72 * SECOND).toISOString(),
          range: 75,
          rating: 1284,
          hostUserId: me.id,
          players: ['Admin'],
          searching: 212,
        },
        match: {
          id: 'm1',
          mode: '1v1',
          firstTo: 2,
          expiresAt: new Date(shotAt + left * SECOND).toISOString(),
          acceptSeconds: 60,
          range: 75,
          stakes: { win: 16, loss: 14 },
          yours: [seat(true)],
          theirs: [seat(false)],
        },
      })
      await page.routeWebSocket(/\/ws\/me/, ws => {
        const server = ws.connectToServer()
        ws.onMessage(m => server.send(m))
        server.onMessage(m => {
          ws.send(m)
          ws.send(JSON.stringify({ type: 'matchmaking', pausedUntil: null, ...state() }))
        })
      })
      await page.goto('/#/play')
      await page.reload()
      await page.waitForTimeout(1500)
      await shot(page, `${DIR}/found-${label}-${name}.png`, { settle: 900 })
      await ctx.close()
    })
  }
}
