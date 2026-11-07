import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { VIEW, open, openHash, shot } from './helpers.js'

// The Ranks and Matchmaking pages, with the ranked profile and a board mocked (the stack has no
// ranked games). RANKED_PAGES_PREFIX names the files ("before-"), to shoot the same scenes on another build.
const PREFIX = process.env.RANKED_PAGES_PREFIX ?? ''
const DIR = 'ranked-pages'

const day = (n: number, h = 20) => new Date(Date.UTC(2026, 10, n, h, 14)).toISOString()
const opponent = (userId: string, name: string, rating: number | null, rankIndex: number | null) => ({
  userId,
  name,
  rating,
  rankIndex,
  avatar: { kind: 'none' },
})

async function mockRanked(page: Page) {
  await page.route('**/api/ranked/me', route =>
    route.fulfill({
      json: {
        ratings: [
          { mode: '1v1', rating: 1284, rankIndex: 14, matches: 40, wins: 23, streak: 3, change30d: 46 },
          { mode: '2v2', rating: 1241, rankIndex: 13, matches: 12, wins: 6, streak: 0, change30d: 12 },
        ],
        onlineAverage: 58.4,
        recent: [
          {
            sessionId: 's1',
            mode: '1v1',
            won: true,
            change: 17,
            at: day(6),
            score: { mine: 2, theirs: 1 },
            opponents: [opponent('a', 'Anna K.', 1301, 15)],
          },
          {
            sessionId: 's2',
            mode: '2v2',
            won: true,
            change: 14,
            at: day(5),
            score: { mine: 2, theirs: 0 },
            opponents: [opponent('m', 'Marco', 1220, 12), opponent('j', 'Jule', 1240, 13)],
          },
          {
            sessionId: 's3',
            mode: '1v1',
            won: false,
            change: -12,
            at: day(5, 18),
            score: { mine: 1, theirs: 2 },
            opponents: [opponent('b', 'Ben R.', 1262, 14)],
          },
          {
            sessionId: 's4',
            mode: '1v1',
            won: true,
            change: 15,
            at: day(3),
            score: { mine: 2, theirs: 0 },
            opponents: [opponent('t', 'Tom S.', 1190, 11)],
          },
        ],
      },
    }),
  )
  await page.route('**/api/boards', route =>
    route.fulfill({
      json: {
        boards: [
          {
            id: 'b1',
            name: 'Living room',
            online: true,
            hardwareId: null,
            bridgeVersion: null,
            bmVersion: null,
            createdAt: day(1),
            ip: null,
            bmUrl: null,
            autoStart: true,
            resetOnNext: false,
            bridgeUpdate: { state: 'idle' },
            bigScreen: { enabled: false },
          },
        ],
      },
    }),
  )
}

for (const [view, name] of [
  [VIEW.wide, 'desktop'],
  [VIEW.phone, 'phone'],
] as const) {
  test(`the Matchmaking page, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await mockRanked(page)
    await openHash(page, '/matchmaking')
    await expect(page.getByText('Recent ranked').first()).toBeVisible()
    await expect(page.getByText('Anna K.')).toBeVisible()
    await shot(page, `${DIR}/${PREFIX}matchmaking-${name}.png`, { settle: 900 })
    if (name === 'phone') {
      await page.getByRole('region', { name: 'Recent ranked matches' }).scrollIntoViewIfNeeded()
      await shot(page, `${DIR}/${PREFIX}matchmaking-recent-${name}.png`, { settle: 600 })
    }
    await ctx.close()
  })

  test(`the Ranks page, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await mockRanked(page)
    await openHash(page, '/matchmaking/ranks')
    await expect(page.getByRole('region', { name: /Your rank · 1v1/ })).toBeVisible()
    await shot(page, `${DIR}/${PREFIX}ranks-${name}.png`, { settle: 900 })
    await ctx.close()
  })
}
