import { describe, it, expect, vi } from 'vitest'
import { parseSnapshot } from '../ws.js'
import fixture from './fixtures/x01-snapshot.json'

describe('parseSnapshot', () => {
  it('parses a snapshot the backend sends, typed by game', () => {
    const s = parseSnapshot(fixture)
    expect(s?.gameId).toBe('x01')
    if (s?.gameId === 'x01') expect(s.game.scores).toHaveLength(2)
  })

  it('strips unknown fields from a snapshot', () => {
    const s = parseSnapshot({ ...fixture, extra: 1, game: { ...fixture.game, extra: 2 } })
    expect(s).not.toBeNull()
    expect(s && 'extra' in s).toBe(false)
    expect(s && 'extra' in s.game).toBe(false)
  })

  it('stays silent about messages that are not snapshots', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    for (const m of [null, 'x', 42, {}, { type: 'hello' }]) expect(parseSnapshot(m)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('rejects anything else, with a warning for snapshot-like messages', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    for (const m of [null, 'x', 42, {}, { type: 'hello' }, { ...fixture, game: {} }, { ...fixture, gameId: 'cricket' }]) {
      expect(parseSnapshot(m)).toBeNull()
    }
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
