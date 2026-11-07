import { describe, it, expect } from 'vitest'
import { beforeEach, vi } from 'vitest'
import {
  DEFAULT_FILTERS,
  deleteGame,
  filterQuery,
  invalidateGame,
  invalidationText,
  outcome,
  loadQueue,
  removeFromQueue,
  restoreGame,
  voidGame,
  waitText,
  type AdminGameSummary,
} from './games'
import { api } from '$lib/api'

vi.mock('$lib/api', () => ({ api: { POST: vi.fn(), GET: vi.fn(), DELETE: vi.fn() } }))

const game = (o: Partial<AdminGameSummary> = {}): AdminGameSummary => ({
  id: 'g1',
  mode: 'x01',
  status: 'finished',
  config: {},
  createdAt: '2026-10-01T09:00:00Z',
  finishedAt: '2026-10-01T09:30:00Z',
  board: null,
  voided: false,
  ranked: false,
  invalidated: null,
  players: [
    { seat: 0, name: 'Ann', userId: 'u1', bot: null, placement: 1, forfeited: false },
    { seat: 1, name: 'Bob', userId: 'u2', bot: null, placement: 2, forfeited: false },
  ],
  ...o,
})

describe('filterQuery', () => {
  it('asks for the invalidated games on request', () => {
    expect(filterQuery({ ...DEFAULT_FILTERS, status: 'invalidated' }, null)).toEqual({ status: 'invalidated' })
  })

  it('asks for finished games with nothing else by default', () => {
    expect(filterQuery(DEFAULT_FILTERS, null)).toEqual({ status: 'finished' })
  })

  it('leaves blank filters out and trims the player', () => {
    expect(filterQuery({ ...DEFAULT_FILTERS, status: 'all', mode: 'x01', player: '  ann ', ranked: true }, 'c1')).toEqual({
      status: 'all',
      mode: 'x01',
      player: 'ann',
      ranked: true,
      cursor: 'c1',
    })
  })

  it('makes the to date inclusive of its whole day', () => {
    const q = filterQuery({ ...DEFAULT_FILTERS, from: '2026-10-01', to: '2026-10-03' }, null)
    const ms = (iso: string | undefined) => new Date(iso ?? '').getTime()
    expect(ms(q.to) - ms(q.from)).toBeGreaterThanOrEqual(2 * 23 * 3600_000)
    expect(filterQuery({ ...DEFAULT_FILTERS, from: 'nope' }, null)).toEqual({ status: 'finished' })
  })
})

describe('outcome', () => {
  it('names the winner', () => {
    expect(outcome(game())).toBe('Ann won')
  })
  it('names every seat of a winning team', () => {
    const players = game().players.map((p, i) => ({ ...p, placement: i < 2 ? 1 : 2 }))
    expect(outcome(game({ players }))).toBe('Ann & Bob won')
  })
  it('says why a game has no winner', () => {
    expect(outcome(game({ status: 'aborted' }))).toBe('Aborted')
    expect(outcome(game({ status: 'active' }))).toBe('In progress')
  })
  it('does not call a solo game won', () => {
    expect(outcome(game({ players: game().players.slice(0, 1) }))).toBe('Finished')
  })
})

describe('invalidateGame', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the trimmed reason and returns the modes that were recalculated', async () => {
    vi.mocked(api.POST).mockResolvedValue({ data: { recalculated: ['1v1'] }, response: new Response() })
    expect(await invalidateGame('g1', '  Board was misreading ')).toEqual({ recalculated: ['1v1'] })
    expect(api.POST).toHaveBeenCalledWith('/api/admin/games/{id}/invalidate', {
      params: { path: { id: 'g1' } },
      body: { reason: 'Board was misreading' },
    })
  })

  it("returns the server's reason when it refuses", async () => {
    vi.mocked(api.POST).mockResolvedValue({ error: { error: 'This game is already invalidated' }, response: new Response() })
    expect(await invalidateGame('g1', '')).toEqual({ error: 'This game is already invalidated' })
  })
})

describe('deleteGame', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the modes that were recalculated', async () => {
    vi.mocked(api.DELETE).mockResolvedValue({ data: { recalculated: ['1v1'] }, response: new Response() })
    expect(await deleteGame('g1')).toEqual({ recalculated: ['1v1'] })
    expect(api.DELETE).toHaveBeenCalledWith('/api/admin/games/{id}', { params: { path: { id: 'g1' } } })
  })

  it("returns the server's reason when it refuses", async () => {
    vi.mocked(api.DELETE).mockResolvedValue({ error: { error: 'A game in progress cannot be deleted' }, response: new Response() })
    expect(await deleteGame('g1')).toEqual({ error: 'A game in progress cannot be deleted' })
  })
})

describe('restoreGame', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the modes that were recalculated', async () => {
    vi.mocked(api.POST).mockResolvedValue({ data: { recalculated: ['1v1'] }, response: new Response() })
    expect(await restoreGame('g1')).toEqual({ recalculated: ['1v1'] })
    expect(api.POST).toHaveBeenCalledWith('/api/admin/games/{id}/restore', { params: { path: { id: 'g1' } } })
  })

  it("returns the server's reason when it refuses", async () => {
    vi.mocked(api.POST).mockResolvedValue({ error: { error: 'This game is not invalidated' }, response: new Response() })
    expect(await restoreGame('g1')).toEqual({ error: 'This game is not invalidated' })
  })
})

describe('invalidationText', () => {
  const at = '2026-10-02T10:00:00.000Z'
  it('says who, when and why', () => {
    expect(invalidationText({ at, by: { id: 'm1', name: 'Mo' }, reason: 'Board was misreading' })).toBe(
      'Invalidated by Mo on 2 Oct 2026: Board was misreading',
    )
  })

  it('leaves out the reason when there is none, and the moderator once their account is gone', () => {
    expect(invalidationText({ at, by: null, reason: null })).toBe('Invalidated on 2 Oct 2026')
  })
})

describe('voiding and the ranked queue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls a voided game voided, not aborted', () => {
    expect(outcome(game({ status: 'aborted', voided: true }))).toBe('Voided')
    expect(outcome(game({ status: 'aborted' }))).toBe('Aborted')
  })

  it('voids with the trimmed reason; a refusal gives its message', async () => {
    vi.mocked(api.POST).mockResolvedValueOnce({ response: new Response(null, { status: 204 }) })
    expect(await voidGame('g1', ' board fault ')).toEqual({ ok: true })
    expect(api.POST).toHaveBeenCalledWith('/api/admin/games/{id}/void', { params: { path: { id: 'g1' } }, body: { reason: 'board fault' } })
    vi.mocked(api.POST).mockResolvedValueOnce({ error: { error: 'Only a running ranked game can be voided' }, response: new Response() })
    expect(await voidGame('g1', '')).toEqual({ error: 'Only a running ranked game can be voided' })
  })

  it('loads the queue, null when the request fails', async () => {
    vi.mocked(api.GET).mockResolvedValueOnce({ data: { searches: [] }, response: new Response() } as never)
    expect(await loadQueue()).toEqual([])
    vi.mocked(api.GET).mockResolvedValueOnce({ error: { error: 'x' }, response: new Response() })
    expect(await loadQueue()).toBeNull()
  })

  it('removes a user from the queue', async () => {
    vi.mocked(api.POST).mockResolvedValueOnce({ error: { error: 'not in the queue' }, response: new Response() })
    expect(await removeFromQueue('u1', '')).toEqual({ error: 'not in the queue' })
    expect(api.POST).toHaveBeenCalledWith('/api/admin/ranked/queue/{userId}/remove', {
      params: { path: { userId: 'u1' } },
      body: { reason: '' },
    })
  })

  it('shows a wait as minutes and seconds', () => {
    expect(waitText(65)).toBe('1:05')
    expect(waitText(9)).toBe('0:09')
  })
})
