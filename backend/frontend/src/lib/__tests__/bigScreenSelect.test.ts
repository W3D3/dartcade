import { describe, it, expect } from 'vitest'
import { viewFor } from '../bigscreen/select.js'

const snap = (gameId: string) => ({ gameId }) as never
const game = (id: string) => ({ kind: 'game' as const, snapshot: snap(id) })
const result = (id: string) => ({ kind: 'result' as const, snapshot: snap(id), until: 1 })

describe('viewFor', () => {
  it('idle', () => expect(viewFor({ kind: 'idle' }).component).toBe('idle'))
  it('live games by game id', () => {
    for (const id of ['x01', 'atc', 'p121', 'hilo', 'minigolf']) expect(viewFor(game(id)).component).toBe(id)
  })
  it('x01 result has its win design; minigolf and the others get the generic card', () => {
    expect(viewFor(result('x01')).component).toBe('x01-win')
    for (const id of ['minigolf', 'atc', 'p121', 'hilo']) expect(viewFor(result(id)).component).toBe('generic-result')
  })
  it('an unknown game id falls back', () => {
    expect(viewFor(game('soccer')).component).toBe('fallback')
    expect(viewFor(result('soccer')).component).toBe('fallback')
  })
})
