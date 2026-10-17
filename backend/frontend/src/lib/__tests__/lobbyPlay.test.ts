import { describe, it, expect } from 'vitest'
import { boardToApply, chosenGame, lobbyPath, offersNewLobby, playAction, playLabel } from '../lobby/play.js'

describe('playLabel', () => {
  it("Choose players with or without a lobby of your own; Open lobby in someone else's", () => {
    expect(playLabel('create')).toBe('Choose players')
    expect(playLabel('continue')).toBe('Choose players')
    expect(playLabel('open')).toBe('Open lobby')
  })
})

describe('offersNewLobby', () => {
  it('only to the host of a solo lobby with no game running', () => {
    expect(offersNewLobby(null)).toBe(false)
    expect(offersNewLobby({ youHost: true, solo: true, sessionId: null })).toBe(true)
    expect(offersNewLobby({ youHost: true, solo: false, sessionId: null })).toBe(false)
    expect(offersNewLobby({ youHost: true, solo: true, sessionId: 's1' })).toBe(false)
    expect(offersNewLobby({ youHost: false, solo: true, sessionId: null })).toBe(false)
  })
})

describe('playAction', () => {
  it('no lobby: create one', () => {
    expect(playAction(null)).toBe('create')
  })

  it('your own lobby: continue in it', () => {
    expect(playAction({ youHost: true })).toBe('continue')
  })

  it("someone else's lobby: open it", () => {
    expect(playAction({ youHost: false })).toBe('open')
  })
})

describe('lobbyPath', () => {
  it('the lobby page, carrying the board from "Play on this board"', () => {
    expect(lobbyPath(null)).toBe('/lobby')
    expect(lobbyPath('b 1')).toBe('/lobby?board=b%201')
  })
})

describe('boardToApply', () => {
  const boards = [
    { id: 'b1', name: 'Garage', online: true },
    { id: 'b2', name: 'Kitchen', online: true },
  ]

  it('moves you to one of your boards', () => {
    expect(boardToApply('b2', 'b1', boards)).toBe('b2')
    expect(boardToApply('b2', null, boards)).toBe('b2')
  })

  it("nothing when there's no board, you're on it already, or it isn't yours", () => {
    expect(boardToApply(null, 'b1', boards)).toBeNull()
    expect(boardToApply('b1', 'b1', boards)).toBeNull()
    expect(boardToApply('b9', 'b1', boards)).toBeNull()
  })
})

describe('chosenGame', () => {
  // Each mode's configMeta, as GET /api/games sends it: only the keys matter here
  const meta = (...keys: string[]) => Object.fromEntries(keys.map(k => [k, { label: k }]))
  const games = [
    { id: 'atc', configMeta: meta('finishOn', 'order', 'multiplierAdvances', 'throwAgainOnAllHit') },
    {
      id: 'x01',
      configMeta: meta('format', 'startScore', 'inMode', 'outMode', 'bullOff', 'botSpeed', 'bullValue', 'maxRounds', 'firstTo'),
    },
    { id: 'minigolf', configMeta: meta('course', 'tries', 'maxStrokes', 'ballContact', 'aimAssist', 'shotPreview') },
    { id: 'p121', configMeta: meta('startTarget', 'tries', 'dartsPerTry', 'outMode', 'missRule', 'lock', 'bullOff') },
    { id: 'hilo', configMeta: meta('startHigh', 'startLow', 'lives', 't1Zero', 'matchExtremes', 'bullOff') },
    { id: 'newmode', configMeta: meta('rounds', 'bullOff') },
  ]

  it("keeps Minigolf's own fields, and only those", () => {
    const config = {
      course: 'test',
      tries: 1,
      maxStrokes: 5,
      ballContact: true,
      aimAssist: false,
      shotPreview: true,
      startScore: 501,
    }
    expect(chosenGame(games, 'minigolf', config)).toEqual({
      gameId: 'minigolf',
      config: { course: 'test', tries: 1, maxStrokes: 5, ballContact: true, aimAssist: false, shotPreview: true },
    })
  })

  it("keeps all of x01's fields, botSpeed included", () => {
    const config = {
      format: 'singles',
      startScore: 301,
      inMode: 'straight',
      outMode: 'double',
      bullOff: 'off',
      bullValue: '25_50',
      maxRounds: 50,
      firstTo: 3,
      botSpeed: 'fast',
      // Another mode's field: must not leak into the saved config
      finishOn: 'bull',
    }
    const { finishOn: _, ...x01 } = config
    expect(chosenGame(games, 'x01', config)).toEqual({ gameId: 'x01', config: x01 })
  })

  it('keeps the X01 Teams format, and leaves teams and teamStart to the lobby', () => {
    const config = { format: 'teams', startScore: 501, teams: [0, 1], teamStart: 'random' }
    expect(chosenGame(games, 'x01', config)?.config).toEqual({ format: 'teams', startScore: 501 })
  })

  it("keeps 121's own fields, and only those", () => {
    const config = {
      startTarget: 121,
      tries: 5,
      dartsPerTry: 9,
      outMode: 'double',
      missRule: 'reset',
      lock: false,
      bullOff: 'off',
      // Not a 121 field: must not leak into the saved config
      startScore: 501,
    }
    expect(chosenGame(games, 'p121', config)).toEqual({
      gameId: 'p121',
      config: { startTarget: 121, tries: 5, dartsPerTry: 9, outMode: 'double', missRule: 'reset', lock: false, bullOff: 'off' },
    })
  })

  it("keeps Higher Lower's own fields, and only those", () => {
    const config = {
      startHigh: 41,
      startLow: 21,
      lives: 3,
      t1Zero: false,
      matchExtremes: true,
      bullOff: 'off',
      // Not in the hilo whitelist: must not leak into the saved config
      startScore: 501,
    }
    expect(chosenGame(games, 'hilo', config)).toEqual({
      gameId: 'hilo',
      config: { startHigh: 41, startLow: 21, lives: 3, t1Zero: false, matchExtremes: true, bullOff: 'off' },
    })
  })

  it("doesn't carry botSpeed for atc, which has no bots", () => {
    const config = { finishOn: 'twenty', order: 'asc', multiplierAdvances: true, throwAgainOnAllHit: false, botSpeed: 'fast' }
    const picked = chosenGame(games, 'atc', config)
    expect(picked?.config).not.toHaveProperty('botSpeed')
  })

  it("keeps the settings of a mode with no special handling, not X01's", () => {
    const config = { rounds: 10, bullOff: 'wdc', startScore: 501, format: 'singles' }
    expect(chosenGame(games, 'newmode', config)).toEqual({ gameId: 'newmode', config: { rounds: 10, bullOff: 'wdc' } })
  })

  it('falls back to a 501 game, then the first one, when the picked mode is unknown to the backend', () => {
    expect(
      chosenGame(
        [
          { id: 'x501', configMeta: {} },
          { id: 'other', configMeta: {} },
        ],
        'missing',
        {},
      )?.gameId,
    ).toBe('x501')
    expect(chosenGame([{ id: 'other', configMeta: {} }], 'missing', {})?.gameId).toBe('other')
  })

  it('null when the backend has no games', () => {
    expect(chosenGame([], 'x01', {})).toBeNull()
  })
})
