import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BASE, VIEW, api, open, shot, hostLobby, addGuest, startLobbyGame, X01 } from './helpers.js'

/** Ends the viewer's running games through the API, the match screen has nothing to click once it is voided. */
async function endGames(page: Page) {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  const { sessions } = (await api(page).get('/api/sessions')) as { sessions: { id: string; status: string }[] }
  for (const s of sessions.filter(s => s.status === 'active'))
    await page.request.delete(`/api/sessions/${s.id}`, { headers: { Origin: BASE } })
}

// The stack has no ranked queue or running ranked games, so what the admin pages list is answered here
const queue = {
  searches: [
    {
      id: 'q1',
      mode: '1v1',
      firstTo: 2,
      since: '2026-11-07T14:00:00.000Z',
      waitSeconds: 184,
      range: 150,
      rating: 1432,
      placing: false,
      players: [{ userId: 'u1', name: 'Luke' }],
    },
    {
      id: 'q2',
      mode: '2v2',
      firstTo: 2,
      since: '2026-11-07T14:02:00.000Z',
      waitSeconds: 41,
      range: 75,
      rating: 1210,
      placing: true,
      players: [
        { userId: 'u2', name: 'Phil' },
        { userId: 'u3', name: 'Michael' },
      ],
    },
  ],
}

const runningGames = {
  games: [
    {
      id: 'run1',
      mode: 'x01',
      status: 'active',
      config: {},
      createdAt: '2026-11-07T14:10:00.000Z',
      finishedAt: null,
      board: { id: 'b1', name: 'Garage board' },
      ranked: true,
      voided: false,
      invalidated: null,
      players: [
        { seat: 0, name: 'Luke', userId: 'u1', bot: null, placement: null, forfeited: false },
        { seat: 1, name: 'Gerwyn', userId: 'u4', bot: null, placement: null, forfeited: false },
      ],
    },
  ],
  nextCursor: null,
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  test(`admin ranked queue ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.route('**/api/admin/ranked/queue', route => route.fulfill({ json: queue }))
    await page.goto('/#/admin/ranked')
    await expect(page.getByRole('region', { name: 'Searches' }).getByText('Luke')).toBeVisible()
    await shot(page, `admin-ranked-void/queue-${name}.png`)
    await page.getByRole('button', { name: 'Remove Luke from the queue' }).click()
    await expect(page.getByText('Remove from the queue?')).toBeVisible()
    await shot(page, `admin-ranked-void/queue-remove-${name}.png`)
    await ctx.close()
  })

  test(`admin void a running ranked game ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.route('**/api/admin/games?*', route => route.fulfill({ json: runningGames }))
    await page.goto('/#/admin/games')
    await expect(page.getByRole('button', { name: 'Void this ranked game' })).toBeVisible()
    await shot(page, `admin-ranked-void/games-${name}.png`)
    await page.getByRole('button', { name: 'Void this ranked game' }).click()
    await expect(page.getByText('Void this ranked game?')).toBeVisible()
    await shot(page, `admin-ranked-void/void-dialog-${name}.png`)
    await ctx.close()
  })

  test(`a voided ranked game, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    const lobby = await hostLobby(page, 'Ranked 1v1', X01())
    await addGuest(page, lobby, 'Anna K.')
    // The server's last snapshot of a voided game: aborted, voided
    await page.routeWebSocket(/\/ws\?/, ws => {
      const server = ws.connectToServer()
      ws.onMessage(m => server.send(m))
      server.onMessage(m => {
        try {
          const msg = JSON.parse(String(m))
          if (msg.type === 'snapshot') {
            msg.voided = true
            msg.status = 'aborted'
          }
          ws.send(JSON.stringify(msg))
        } catch {
          ws.send(m)
        }
      })
    })
    await startLobbyGame(page, lobby)
    await expect(page.getByText('This game was voided by a moderator.')).toBeVisible()
    await shot(page, `admin-ranked-void/voided-match-${name}.png`, { settle: 900 })
    await endGames(page)
    await ctx.close()
  })
}
