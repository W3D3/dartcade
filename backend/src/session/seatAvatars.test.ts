import { describe, it, expect, vi } from 'vitest'
import { SessionEngine, type EngineStore } from './engine.js'
import { x01Module } from '../games/x01.js'
import type { Avatar } from '../db/users.js'

const baseStore: EngineStore = {
  insertSession: vi.fn().mockResolvedValue(undefined),
  getActiveSessions: vi.fn().mockResolvedValue([]),
  getSessionEvents: vi.fn().mockResolvedValue([]),
  appendEvent: vi.fn().mockResolvedValue(undefined),
  insertDarts: vi.fn().mockResolvedValue(undefined),
  deleteDarts: vi.fn().mockResolvedValue(undefined),
  finishSession: vi.fn().mockResolvedValue(undefined),
  abortSession: vi.fn().mockResolvedValue(undefined),
  getAvatars: vi.fn().mockResolvedValue(new Map()),
}

describe('seat avatars in the snapshot', () => {
  it('carries the account picture, follows a change, and is none for a guest', async () => {
    let avatar: Avatar = { kind: 'preset', foreground: 'a', background: 'b' }
    const pushed = vi.fn()
    const store = { ...baseStore, getAvatars: (ids: string[]) => Promise.resolve(new Map(ids.map(id => [id, avatar]))) }
    const e = new SessionEngine(store, pushed)
    const { sessionId } = await e.create('u1', 'board-1', 'x01', x01Module.defaultConfig, [{ name: 'Alice' }, { name: 'Guest' }])
    expect(e.getSnapshot(sessionId)?.seats.map(s => s.avatar)).toEqual([avatar, { kind: 'none' }])

    avatar = { kind: 'upload', version: 2 }
    pushed.mockClear()
    await e.avatarChanged('u1')
    expect(e.getSnapshot(sessionId)?.seats[0].avatar).toEqual(avatar)
    expect(pushed).toHaveBeenCalledWith(sessionId)
  })
})
