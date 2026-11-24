import { test, expect } from '@playwright/test'
import { VIEW, X01, addGuest, endGame, hostLobby, open, openHash, shot, startLobbyGame } from './helpers.js'

// Admins watch any running game: the Watch button on the admin games page (mocked list, the stack has no
// other running game), and the Watch page for a game of Gerwyn, who is only a pending friend request of Admin.

const games = {
  games: [
    {
      id: 'run1',
      mode: 'x01',
      status: 'active',
      config: {},
      createdAt: '2026-11-07T14:10:00.000Z',
      finishedAt: null,
      board: { id: 'b1', name: 'Garage board' },
      ranked: false,
      voided: false,
      invalidated: null,
      players: [
        { seat: 0, name: 'Luke', userId: 'u1', bot: null, placement: null, forfeited: false },
        { seat: 1, name: 'Gerwyn', userId: 'u4', bot: null, placement: null, forfeited: false },
      ],
    },
    {
      id: 'done1',
      mode: 'x01',
      status: 'finished',
      config: {},
      createdAt: '2026-11-07T13:00:00.000Z',
      finishedAt: '2026-11-07T13:30:00.000Z',
      board: null,
      ranked: false,
      voided: false,
      invalidated: null,
      players: [
        { seat: 0, name: 'Phil', userId: 'u2', bot: null, placement: 1, forfeited: false },
        { seat: 1, name: 'Michael', userId: 'u3', bot: null, placement: 2, forfeited: false },
      ],
    },
  ],
  nextCursor: null,
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  test(`admin games: Watch on a running game, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.route('**/api/admin/games?*', route => {
      const status = new URL(route.request().url()).searchParams.get('status')
      return route.fulfill({ json: { ...games, games: games.games.filter(g => status === 'all' || g.status === status) } })
    })
    await page.goto('/#/admin/games')
    // The phone's filters are a sheet: the list is shown from the live page there
    if (name === 'desktop') {
      await page.getByLabel('Status').click()
      await page.getByRole('option', { name: 'Live now' }).click()
      await expect(page.getByRole('link', { name: 'Watch this game' })).toHaveCount(1)
      await shot(page, 'watch/admin-games-desktop.png')
    }
    await page.goto('/#/admin/live')
    await expect(page.getByRole('link', { name: 'Watch' })).toHaveCount(1)
    await shot(page, `watch/admin-live-${name}.png`)
    await ctx.close()
  })
}

test('an admin watches a stranger’s game and is told so', async ({ browser }) => {
  test.setTimeout(180_000)
  const gerwyn = await open(browser, 'gerwyn', VIEW.wide)
  const lobby = await hostLobby(gerwyn.page, 'Private darts', X01({ startScore: 101, firstTo: 1 }))
  await addGuest(gerwyn.page, lobby, 'Anna')
  const session = await startLobbyGame(gerwyn.page, lobby)

  for (const [name, view] of [
    ['desktop', VIEW.desktop],
    ['phone', VIEW.phone],
  ] as const) {
    const admin = await open(browser, 'admin', view)
    await openHash(admin.page, `/watch/${session}`)
    await expect(admin.page.getByText('Watching as admin')).toBeVisible({ timeout: 15_000 })
    await expect(admin.page.getByText('LIVE', { exact: true })).toBeVisible()
    await shot(admin.page, `watch/admin-watching-${name}.png`)
    await admin.ctx.close()
  }
  await endGame(gerwyn.page)
  await gerwyn.ctx.close()
})
