import { describe, it, expect } from 'vitest'
import { x01Module } from './x01.js'
import type { X01Config, X01State } from './x01.js'
import type { BoardEvent, Player } from '../session/types.js'

const players: Player[] = [{ name: 'Alice' }, { name: 'Bob' }]

const defaultCfg: X01Config = {
  startScore: 501, inMode: 'straight', outMode: 'double',
  bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 3,
}

function makeState(overrides: Partial<X01State> = {}): X01State {
  return {
    cfg: defaultCfg, scores: [501, 501], legs: [0, 0],
    opened: [true, true], phase: 'game',
    bullOff: { active: false, darts: [null, null], currentPlayer: 0, playerCount: 2 },
    currentPlayer: 0, round: 1,
    bustThisVisit: false, visitOpenedScores: [501, 501],
    totalDarts: [0, 0], winner: null, playerCount: 2, ...overrides,
  }
}

function dartEvent(number: number, bed: string, multiplier: number, index = 0): BoardEvent {
  return {
    kind: 'dart.detected',
    data: {
      visit_id: 'v1', index,
      dart: { segment: { name: '', number, bed, multiplier }, score: number * multiplier },
      source_seq: 1,
    } as any,
  }
}

describe('init', () => {
  it('starts with startScore for all players', () => {
    const s = x01Module.init(defaultCfg, players)
    expect(s.scores).toEqual([501, 501])
    expect(s.legs).toEqual([0, 0])
    expect(s.winner).toBeNull()
  })

  it('phase is bulloff when bullOff !== off', () => {
    const s = x01Module.init({ ...defaultCfg, bullOff: 'wdc' }, players)
    expect(s.phase).toBe('bulloff')
  })

  it('phase is game when bullOff === off', () => {
    const s = x01Module.init(defaultCfg, players)
    expect(s.phase).toBe('game')
  })

  it('straight in: opened = true for all players', () => {
    const s = x01Module.init(defaultCfg, players)
    expect(s.opened).toEqual([true, true])
  })

  it('double in: opened = false for all players', () => {
    const s = x01Module.init({ ...defaultCfg, inMode: 'double' }, players)
    expect(s.opened).toEqual([false, false])
  })

  it('master in: opened = false for all players', () => {
    const s = x01Module.init({ ...defaultCfg, inMode: 'master' }, players)
    expect(s.opened).toEqual([false, false])
  })

  it('bullOff state active when wdc', () => {
    const s = x01Module.init({ ...defaultCfg, bullOff: 'wdc' }, players)
    expect(s.bullOff.active).toBe(true)
  })

  it('bullOff state inactive when off', () => {
    const s = x01Module.init(defaultCfg, players)
    expect(s.bullOff.active).toBe(false)
  })
})
