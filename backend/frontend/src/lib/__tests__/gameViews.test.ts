import { describe, it, expect } from 'vitest'
import { getGameView } from '../gameViews/index.js'

describe('getGameView', () => {
  it('an unknown game has a plain title and no meta line', () => {
    const view = getGameView('soccer')
    const snapshot = { type: 'snapshot', sessionId: 's', gameId: 'soccer', boardId: null, players: [], game: {}, bmStatus: null } as any
    expect(view.title).toBe('Game')
    expect(view.meta(snapshot)).toBe('')
  })
})
