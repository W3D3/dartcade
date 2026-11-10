import { test, expect } from '@playwright/test'
import type { Page, WebSocketRoute } from '@playwright/test'
import { VIEW, X01, closeToasts, hostLobby, open, openHash, shot, startLobbyGame, userId } from './helpers.js'

// The Achievements page, a profile's Achievements tab and the unlock toasts with mocked answers (the
// shot database has no finished games to count): the numbers are the Achievements board's own.
const row = (id: string, count: number, tier: number, tierAt: string | null = '2026-11-03T10:00:00Z') => ({
  id,
  count,
  tier,
  earnedAt: tierAt,
  tierAt,
  isNew: false,
})
const mine = {
  achievements: [
    row('x01.180', 14, 3, '2026-11-01T10:00:00Z'),
    { ...row('x01.bigFish', 1, 1), isNew: true },
    row('x01.tonPlus', 612, 3),
    row('x01.tonPlusOut', 17, 2),
    row('x01.bedAndBreakfast', 71, 2),
    row('x01.bullseye', 83, 2),
    row('x01.bullFinish', 3, 1),
    row('x01.doubleTheDoubles', 0, 0, null),
    row('x01.madhouse', 2, 1),
  ],
  showcase: ['x01.180', 'x01.bigFish', 'x01.tonPlus', 'x01.tonPlusOut', 'x01.bedAndBreakfast'],
  unseen: 1,
}
const theirs = {
  achievements: [
    row('x01.180', 23, 4, '2026-11-01T10:00:00Z'),
    row('x01.bigFish', 4, 2),
    row('x01.tonPlus', 788, 3),
    row('x01.tonPlusOut', 31, 3),
    row('x01.bedAndBreakfast', 40, 1),
    row('x01.bullseye', 141, 3),
    row('x01.bullFinish', 7, 2),
    row('x01.doubleTheDoubles', 2, 1),
  ],
  showcase: ['x01.180', 'x01.bullseye', 'x01.tonPlusOut'],
  unseen: 0,
}

async function mock(page: Page, otherId?: string, showcase = mine.showcase): Promise<void> {
  await page.route('**/api/achievements', r => r.fulfill({ json: { ...mine, showcase } }))
  await page.route('**/api/achievements/seen', r => r.fulfill({ status: 204, body: '' }))
  await page.route('**/api/users/*/achievements', r => r.fulfill({ json: r.request().url().includes(`/${otherId}/`) ? theirs : mine }))
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  test(`achievements: page ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page)
    await openHash(s.page, '/progress/achievements')
    await expect(s.page.getByRole('heading', { name: 'ONE HUNDRED AND EIGHTYYY' })).toBeVisible()
    await shot(s.page, `achievements/page-${name}.png`, { fullPage: name === 'desktop', settle: 1000 })
    await s.ctx.close()
  })

  test(`achievements: profile ${name}`, async ({ browser }) => {
    const other = await open(browser, 'luke', VIEW.phone)
    const lukeId = await userId(other.page)
    await other.ctx.close()
    const s = await open(browser, 'admin', view)
    await mock(s.page, lukeId)
    await openHash(s.page, `/profile/${lukeId}`)
    await expect(s.page.getByRole('region', { name: 'Showcase' })).toBeVisible()
    await shot(s.page, `achievements/profile-overview-${name}.png`, { fullPage: name === 'desktop', settle: 1000 })
    await s.page.getByRole('tab', { name: /^Achievements/ }).click()
    await expect(s.page.getByText('You both have')).toBeVisible()
    await shot(s.page, `achievements/profile-tab-${name}.png`, { fullPage: name === 'desktop', settle: 1000 })
    await s.ctx.close()
  })
}

// A showcase with empty slots (the Empty slot text must not touch the dashed border on a phone)
for (const [name, view] of [
  ['390', VIEW.phone],
  ['320', VIEW.narrowPhone],
] as const) {
  test(`achievements: showcase with empty slots ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page, undefined, ['x01.180', 'x01.bigFish'])
    await openHash(s.page, '/progress/achievements')
    await expect(s.page.getByText('Empty slot').first()).toBeVisible()
    await s.page.getByRole('region', { name: 'Showcase' }).scrollIntoViewIfNeeded()
    await shot(s.page, `achievements/showcase-empty-phone-${name}.png`, { settle: 800 })
    await s.ctx.close()
  })
}

type Unlocked = { id: string; tier: number; count: number; tierUp: boolean; xp: number }
const UNLOCKS: [string, Unlocked[], string?][] = [
  ['first', [{ id: 'x01.bigFish', tier: 1, count: 1, tierUp: false, xp: 100 }]],
  ['tier-up', [{ id: 'x01.180', tier: 3, count: 10, tierUp: true, xp: 300 }]],
  [
    'several',
    [
      { id: 'x01.madhouse', tier: 1, count: 1, tierUp: false, xp: 100 },
      { id: 'x01.bullseye', tier: 2, count: 50, tierUp: true, xp: 150 },
      { id: 'x01.tonPlus', tier: 1, count: 10, tierUp: false, xp: 100 },
    ],
  ],
  ['in-match', [{ id: 'x01.bedAndBreakfast', tier: 2, count: 52, tierUp: true, xp: 150 }], 'match'],
]
for (const [kind, unlocked, route] of UNLOCKS) {
  for (const [name, view] of [
    ['desktop', VIEW.desktop],
    ['phone', VIEW.phone],
  ] as const) {
    if (kind === 'in-match' && name === 'phone') continue
    test(`achievements: toast ${kind} ${name}`, async ({ browser }) => {
      const s = await open(browser, 'admin', view)
      await mock(s.page)
      let me: WebSocketRoute | undefined
      // Ready once the server has spoken: the page's socket is open and listening by then
      let ready = false
      await s.page.routeWebSocket(/\/ws\/me$/, ws => {
        me = ws
        const server = ws.connectToServer()
        ws.onMessage(m => server.send(m))
        server.onMessage(m => {
          ready = true
          ws.send(m)
        })
      })
      if (route === 'match') {
        // The pill shows over a real match screen
        const lobby = await hostLobby(s.page, 'Achievements', X01())
        await openHash(s.page, `/session/${await startLobbyGame(s.page, lobby)}`)
      } else await openHash(s.page, '/progress/achievements')
      await expect.poll(() => ready).toBe(true)
      await s.page.waitForTimeout(500)
      await closeToasts(s.page)
      me?.send(JSON.stringify({ type: 'achievement.unlocked', sessionId: 'shot', unlocked, levelBefore: 1, levelAfter: 1 }))
      await expect(s.page.locator('.toast')).toBeVisible()
      await shot(s.page, `achievements/toast-${kind}-${name}.png`, { settle: 1200, keepToasts: true })
      await s.ctx.close()
    })
  }
}
