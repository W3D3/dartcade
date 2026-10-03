import { describe, it, expect, vi } from 'vitest'
import { get } from 'svelte/store'
import { createSessionStore, parseNotice, parseSnapshot } from '../ws.js'
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

describe('parseNotice', () => {
  const notice = { type: 'notice', code: 'not_your_turn', boardId: 'b', throwerName: 'Lena', throwerBoard: "Lena's place" }

  it('parses a not-your-turn notice', () => {
    expect(parseNotice(notice)).toEqual(notice)
  })

  it('takes a thrower who enters darts by hand', () => {
    expect(parseNotice({ ...notice, throwerBoard: null })?.throwerBoard).toBeNull()
  })

  it('ignores anything else, silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    for (const m of [null, 'x', { type: 'notice' }, { ...notice, code: 'other' }, { ...notice, throwerName: undefined }, fixture]) {
      expect(parseNotice(m)).toBeNull()
    }
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('createSessionStore', () => {
  it('says whether the game socket is open', () => {
    const sockets: { onopen: (() => void) | null; onclose: ((e: { code: number }) => void) | null; close: () => void }[] = []
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onclose: ((e: { code: number }) => void) | null = null
      onmessage = null
      onerror = null
      constructor() { sockets.push(this) }
      close() { /* the test closes it */ }
      send() { /* unused */ }
    })
    vi.useFakeTimers()
    try {
      const store = createSessionStore('s1')
      expect(get(store.connected)).toBe(false)
      sockets[0].onopen?.()
      expect(get(store.connected)).toBe(true)
      sockets[0].onclose?.({ code: 1006 })
      expect(get(store.connected)).toBe(false)
      store.destroy()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})
