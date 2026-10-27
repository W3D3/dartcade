import { describe, it, expect } from 'vitest'
import { viewFor, BIG_SCREEN_VIEWS } from '../bigscreen/select.js'
import GenericResult from '../components/bigscreen/GenericResult.svelte'

const snap = (gameId: string, winner: number | null = 0) => ({ gameId, game: { winner } }) as never
const game = (id: string) => ({ kind: 'game' as const, snapshot: snap(id) })
const result = (id: string, winner: number | null = 0) => ({ kind: 'result' as const, snapshot: snap(id, winner), until: 1 })
const comp = (v: ReturnType<typeof viewFor>) => ('component' in v ? v.component : null)

describe('viewFor', () => {
  it('idle', () => expect(viewFor({ kind: 'idle' }).kind).toBe('idle'))
  it('live games by game id', () => {
    for (const id of ['x01', 'atc', 'p121', 'hilo', 'minigolf']) {
      expect(viewFor(game(id)).kind).toBe('live')
      expect(comp(viewFor(game(id)))).toBe(BIG_SCREEN_VIEWS[id as 'x01']?.live)
    }
  })
  it('x01 result has its win design; minigolf and the others get the generic card', () => {
    expect(comp(viewFor(result('x01')))).toBe(BIG_SCREEN_VIEWS.x01?.result)
    for (const id of ['minigolf', 'atc', 'p121', 'hilo']) expect(comp(viewFor(result(id)))).toBe(GenericResult)
  })
  it('an x01 forfeit (no winner) needs the saved game for its win view', () => {
    expect(comp(viewFor(result('x01', null)))).toBe(GenericResult)
    expect(comp(viewFor({ ...result('x01', null), detail: {} as never }))).toBe(BIG_SCREEN_VIEWS.x01?.result)
  })
  it('an unknown game id falls back', () => {
    expect(viewFor(game('soccer')).kind).toBe('fallback')
    expect(viewFor(result('soccer')).kind).toBe('fallback')
  })
})
