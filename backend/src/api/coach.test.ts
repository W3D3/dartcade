import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { coachApiPlugin } from './coach.js'
import type { components } from '../schema/api.js'
import type { DartClass } from '../shared/coach/dartClass.js'
import type { LegReview } from '../shared/coach/review.js'

// Compile-time parity (checked by `npm run typecheck`): a stored LegReview (and its darts' class)
// is exactly the API's schema, both ways, so schema/api-v1.yaml can't quietly drift from the shared type.
export const legReviewParity = {
  toApi: (x: LegReview): components['schemas']['LegReview'] => x,
  fromApi: (x: components['schemas']['LegReview']): LegReview => x,
  dartClassToApi: (x: DartClass): components['schemas']['DartClass'] => x,
  dartClassFromApi: (x: components['schemas']['DartClass']): DartClass => x,
}

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'ann'
    done()
  }),
}))
vi.mock('../flags/index.js', () => ({ flagEnabled: vi.fn(), loadFlagUser: vi.fn() }))
vi.mock('../coach/store.js', () => ({ ensureCoachLegs: vi.fn(), ensureCoachGame: vi.fn() }))
vi.mock('../coach/legs.js', () => ({ coachLegsSummary: vi.fn(), coachLegsPage: vi.fn(), getCoachLeg: vi.fn() }))
vi.mock('../db/ranked.js', () => ({ x01AverageSince: vi.fn() }))

import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { ensureCoachGame, ensureCoachLegs } from '../coach/store.js'
import { coachLegsSummary, coachLegsPage, getCoachLeg } from '../coach/legs.js'
import { x01AverageSince } from '../db/ranked.js'

const review: LegReview = {
  coachLevel: 7,
  leg: 0,
  seat: 0,
  won: true,
  darts: 9,
  average: 45,
  visits: [],
  skills: { scoring: { grade: null, line: '–' }, setup: { grade: null, line: '–' }, doubling: { grade: null, line: '–' } },
  take: 'Won in 9 darts.',
  counts: { lowVisits: 0, badSetups: 0, missedDoubles: 0, clean: true },
  grouping: { spreadMm: null, edgeMm: null },
}

function app() {
  const a = createFastify()
  a.register(coachApiPlugin, { db: {} as any })
  return a
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(flagEnabled).mockResolvedValue(true)
  vi.mocked(loadFlagUser).mockResolvedValue(null)
  vi.mocked(ensureCoachLegs).mockResolvedValue(0)
})

describe('GET /api/coach/legs', () => {
  it("builds the user's missing reviews, then returns counts, legs and the cursor", async () => {
    vi.mocked(coachLegsSummary).mockResolvedValue({
      counts: { legs: 5, lowVisits: 1, badSetups: 2, missedDoubles: 3, cleanLegs: 2 },
      updatedAt: new Date('2026-10-02T00:00:00Z'),
    })
    vi.mocked(coachLegsPage).mockResolvedValue({
      rows: [
        {
          gameId: 'g1',
          leg: 0,
          finishedAt: new Date('2026-10-02T00:00:00Z'),
          opponents: ['Bob'],
          context: '501 · leg 1',
          won: true,
          darts: 9,
          average: 60,
          lowVisits: 0,
          badSetups: 0,
          missedDoubles: 0,
          clean: true,
        },
      ],
      next: { finishedAt: new Date('2026-10-01T00:00:00Z'), gameId: 'g0', leg: 0 },
    })
    const res = await app().inject({ method: 'GET', url: '/api/coach/legs' })
    expect(res.statusCode).toBe(200)
    expect(ensureCoachLegs).toHaveBeenCalledWith(expect.anything(), 'ann', expect.any(Function))
    expect(coachLegsPage).toHaveBeenCalledWith(expect.anything(), 'ann', 'all', null)
    const body = JSON.parse(res.body)
    expect(body.counts).toEqual({ legs: 5, lowVisits: 1, badSetups: 2, missedDoubles: 3, cleanLegs: 2 })
    expect(body.updatedAt).toBe('2026-10-02T00:00:00.000Z')
    expect(body.legs).toEqual([
      {
        gameId: 'g1',
        leg: 0,
        finishedAt: '2026-10-02T00:00:00.000Z',
        opponents: ['Bob'],
        context: '501 · leg 1',
        won: true,
        darts: 9,
        average: 60,
        lowVisits: 0,
        badSetups: 0,
        missedDoubles: 0,
        clean: true,
      },
    ])
    expect(typeof body.nextCursor).toBe('string')
  })

  it('passes the filter through, defaulting to all', async () => {
    vi.mocked(coachLegsSummary).mockResolvedValue({
      counts: { legs: 0, lowVisits: 0, badSetups: 0, missedDoubles: 0, cleanLegs: 0 },
      updatedAt: null,
    })
    vi.mocked(coachLegsPage).mockResolvedValue({ rows: [], next: null })
    await app().inject({ method: 'GET', url: '/api/coach/legs?filter=lost' })
    expect(coachLegsPage).toHaveBeenCalledWith(expect.anything(), 'ann', 'lost', null)
  })

  it('400s on a cursor nobody encoded, without touching the store', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/coach/legs?cursor=not-a-real-cursor' })
    expect(res.statusCode).toBe(400)
    expect(ensureCoachLegs).not.toHaveBeenCalled()
  })

  it('is not there while coach.enabled is off for you', async () => {
    vi.mocked(flagEnabled).mockResolvedValue(false)
    const res = await app().inject({ method: 'GET', url: '/api/coach/legs' })
    expect(res.statusCode).toBe(404)
    expect(ensureCoachLegs).not.toHaveBeenCalled()
  })
})

describe('GET /api/coach/legs/:gameId/:leg', () => {
  it('404s when the leg is not a stored review of the requesting user, even after building the game', async () => {
    vi.mocked(getCoachLeg).mockResolvedValue(null)
    const res = await app().inject({ method: 'GET', url: '/api/coach/legs/g1/0' })
    expect(res.statusCode).toBe(404)
    expect(getCoachLeg).toHaveBeenCalledWith(expect.anything(), 'ann', 'g1', 0)
    expect(ensureCoachGame).toHaveBeenCalledWith(expect.anything(), 'ann', 'g1', expect.any(Function))
    expect(getCoachLeg).toHaveBeenCalledTimes(2)
  })

  it("builds a game's rows when its leg has none yet, then returns it", async () => {
    const detail = {
      review,
      opponents: ['Bob'],
      context: '501 · leg 1',
      finishedAt: new Date('2026-10-02T00:00:00Z'),
      won: true,
      winnerName: 'Ann',
      winnerDarts: 9,
    }
    vi.mocked(getCoachLeg).mockResolvedValueOnce(null).mockResolvedValueOnce(detail)
    const res = await app().inject({ method: 'GET', url: '/api/coach/legs/g1/0' })
    expect(res.statusCode).toBe(200)
    expect(res.json().title).toMatchObject({ won: true, winnerName: 'Ann' })
    expect(ensureCoachGame).toHaveBeenCalledTimes(1)
  })

  it('reads a stored leg without building', async () => {
    vi.mocked(getCoachLeg).mockResolvedValue({
      review,
      opponents: [],
      context: '501 · leg 1',
      finishedAt: new Date('2026-10-02T00:00:00Z'),
      won: true,
      winnerName: 'Ann',
      winnerDarts: 9,
    })
    expect((await app().inject({ method: 'GET', url: '/api/coach/legs/g1/0' })).statusCode).toBe(200)
    expect(ensureCoachGame).not.toHaveBeenCalled()
  })

  it('is not there while coach.enabled is off for you', async () => {
    vi.mocked(flagEnabled).mockResolvedValue(false)
    const res = await app().inject({ method: 'GET', url: '/api/coach/legs/g1/0' })
    expect(res.statusCode).toBe(404)
    expect(getCoachLeg).not.toHaveBeenCalled()
  })

  it("reads the title's winnerName and winnerDarts straight off the stored row", async () => {
    vi.mocked(getCoachLeg).mockResolvedValue({
      review,
      opponents: ['Bob'],
      context: '501 · leg 1',
      finishedAt: new Date('2026-10-02T00:00:00Z'),
      won: true,
      winnerName: 'Ann',
      winnerDarts: 9,
    })
    const res = await app().inject({ method: 'GET', url: '/api/coach/legs/g1/0' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.review).toEqual(review)
    expect(body.title).toEqual({
      opponents: ['Bob'],
      context: '501 · leg 1',
      finishedAt: '2026-10-02T00:00:00.000Z',
      won: true,
      winnerName: 'Ann',
      winnerDarts: 9,
    })
  })

  it('passes a null winner through for a leg the round limit cut short', async () => {
    vi.mocked(getCoachLeg).mockResolvedValue({
      review,
      opponents: ['Bob'],
      context: '501 · leg 1',
      finishedAt: new Date('2026-10-02T00:00:00Z'),
      won: false,
      winnerName: null,
      winnerDarts: null,
    })
    const res = await app().inject({ method: 'GET', url: '/api/coach/legs/g1/0' })
    const body = JSON.parse(res.body)
    expect(body.title.winnerName).toBeNull()
    expect(body.title.winnerDarts).toBeNull()
  })
})

describe('GET /api/coach/average', () => {
  it("returns the user's 30-day X01 average, behind coach.live.enabled", async () => {
    vi.mocked(x01AverageSince).mockResolvedValue(48.2)
    const res = await app().inject({ method: 'GET', url: '/api/coach/average' })
    expect(JSON.parse(res.body)).toEqual({ average: 48.2 })
    expect(x01AverageSince).toHaveBeenCalledWith(expect.anything(), 'ann', 30)
    expect(flagEnabled).toHaveBeenCalledWith('coach.live.enabled', null)
  })

  it('404s while coach.live.enabled is off', async () => {
    vi.mocked(flagEnabled).mockResolvedValue(false)
    expect((await app().inject({ method: 'GET', url: '/api/coach/average' })).statusCode).toBe(404)
  })
})
