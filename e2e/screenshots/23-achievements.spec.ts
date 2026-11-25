import { test, expect } from '@playwright/test'
import type { Page, WebSocketRoute } from '@playwright/test'
import { VIEW, X01, closeToasts, hostLobby, open, openHash, shot, startLobbyGame, userId } from './helpers.js'

// The Achievements page, a profile's Achievements tab and the unlock toasts with mocked answers (the
// shot database has no finished games to count): the numbers are the Achievements board's own.
const row = (id: string, count: number, tier: number, tierAt: string | null = '2026-11-03T10:00:00Z') => ({
  id,
  count,
  tier,
  tiers: Array.from({ length: tier }, (_, i) => ({ tier: i + 1, reachedAt: tierAt, where: null, gameId: null, gone: false })),
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

  test(`achievements: not earned yet ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await mock(s.page)
    await openHash(s.page, '/progress/achievements')
    await s.page.getByRole('article', { name: 'Double the Doubles' }).first().scrollIntoViewIfNeeded()
    await shot(s.page, `achievements/not-earned-${name}.png`, { settle: 1000 })
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

type Where = { visit: number; leg: number; legVisit: number; darts: { number: number; multiplier: number }[]; dart: null }
/** The admin's best visit in a finished X01 game of the shot database: the unlock links point at it. */
async function seededVisit(page: Page): Promise<{ gameId: string; where: Where }> {
  return page.evaluate(async () => {
    const list = await (await fetch('/api/games?mode=x01&limit=20')).json()
    for (const g of list.games) {
      if (g.mySeat === null) continue
      const d = await (await fetch(`/api/games/${g.id}`)).json()
      if (d.detail.mode !== 'x01') continue
      type V = { visit: number; seat: number; scored: number; darts: { segment: { number: number; multiplier: number } }[] }
      const mine = (d.detail.legs as { leg: number; visits: V[] }[]).flatMap(l =>
        l.visits.filter(v => v.seat === g.mySeat).map((v, i) => ({ v, leg: l.leg, legVisit: i + 1 })),
      )
      const best = mine.sort((a, b) => b.v.scored - a.v.scored)[0]
      if (!best) continue
      const darts = best.v.darts.map(x => ({ number: x.segment.number, multiplier: x.segment.multiplier }))
      return { gameId: g.id, where: { visit: best.v.visit, leg: best.leg, legVisit: best.legVisit, darts, dart: null } }
    }
    throw new Error('no finished X01 game of the admin')
  })
}

// Each tier's visit on the card (a link where the game can be opened, the text where it can't, a game
// gone), and the details page the link opens, with that visit ringed
for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  test(`achievements: unlock links ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await openHash(s.page, '/progress/achievements')
    const { gameId, where } = await seededVisit(s.page)
    const tier = (t: number, reachedAt: string, over = {}) => ({ tier: t, reachedAt, where, gameId, gone: false, ...over })
    const linked = {
      ...mine,
      achievements: mine.achievements.map(a =>
        a.id === 'x01.180'
          ? {
              ...a,
              tiers: [
                tier(1, '2026-10-12T19:00:00Z'),
                tier(2, '2026-10-20T19:00:00Z', { gameId: null }),
                tier(3, '2026-11-01T19:00:00Z', { gameId: null, gone: true }),
              ],
            }
          : a.id === 'x01.bigFish'
            ? { ...a, tiers: [tier(1, '2026-11-03T10:00:00Z', { where: { ...where, dart: where.darts.length - 1 } })] }
            : a,
      ),
    }
    await s.page.route('**/api/achievements', r => r.fulfill({ json: linked }))
    await s.page.route('**/api/achievements/seen', r => r.fulfill({ status: 204, body: '' }))
    await s.page.reload()
    const card = s.page.getByRole('article', { name: 'ONE HUNDRED AND EIGHTYYY' }).first()
    await expect(card.getByText('Game no longer available')).toBeVisible()
    await card.scrollIntoViewIfNeeded()
    await closeToasts(s.page)
    await shot(s.page, `achievements/unlock-links-${name}.png`, { settle: 1000 })
    await card.getByRole('link').first().click()
    await s.page.waitForURL(url => url.hash === `#/stats/history/${gameId}?visit=${where.visit}`)
    const ringed = s.page.locator('[role="cell"][aria-current="true"]')
    await expect(ringed).toHaveCount(1)
    await expect(ringed).toBeInViewport()
    await shot(s.page, `achievements/details-visit-${name}.png`, { settle: 1000 })
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

type Unlocked = { id: string; from: number; tier: number; count: number; xp: number }
const UNLOCKS: [string, Unlocked[], string?][] = [
  ['first', [{ id: 'x01.bigFish', from: 0, tier: 1, count: 1, xp: 100 }]],
  ['tier-up', [{ id: 'x01.180', from: 2, tier: 3, count: 10, xp: 300 }]],
  [
    'several',
    [
      { id: 'x01.madhouse', from: 0, tier: 1, count: 1, xp: 100 },
      { id: 'x01.bullseye', from: 1, tier: 2, count: 50, xp: 150 },
      { id: 'x01.tonPlus', from: 0, tier: 1, count: 10, xp: 100 },
    ],
  ],
  ['in-match', [{ id: 'x01.bedAndBreakfast', from: 1, tier: 2, count: 52, xp: 150 }], 'match'],
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
