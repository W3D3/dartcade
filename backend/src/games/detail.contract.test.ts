import { describe, it, expect } from 'vitest'
import { Ajv } from 'ajv'
import addFormatsModule from 'ajv-formats'
import spec from '../schema/api-v1.deref.json' with { type: 'json' }
import { x01Game } from './x01.js'
import { atcModule } from './atc.js'
import { minigolfModule } from './minigolf.js'
import { p121Game, type P121Config } from './p121.js'
import { hiloGame, type HiloConfig } from './hilo.js'
import { cricketGame, type CricketConfig } from './cricket.js'
import type { BoardEvent } from '../session/types.js'
import { gameList } from './index.js'
import { seededRng } from '../session/rng.js'

const addFormats = addFormatsModule.default
const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
const schemas: Record<string, object> = spec.components.schemas
const dart = {
  index: 0,
  segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 },
  coords: { x: 0.1, y: 0.2 },
  source: 'camera',
  corrected: true,
  thrownAt: '2026-10-01T10:00:00.000Z',
} as const

describe('module detail() matches schema/api-v1.yaml', () => {
  // Every registered game on a fresh state, so a new one is checked without a case of its own
  // here: its detail as GameDetail's `detail`, its match stats as MatchStats.
  // Minigolf plays the built-in test course (no database).
  const configFor = (id: string): Record<string, unknown> => (id === 'minigolf' ? { course: 'test' } : {})
  it.each(gameList.map(m => [m.id, m] as const))('%s, fresh', (id, mod) => {
    const state = mod.init({ ...mod.defaultConfig, ...configFor(id) }, [{ name: 'A' }, { name: 'B' }], seededRng(1))
    const validateDetail = ajv.compile(spec.components.schemas.GameDetail.properties.detail)
    const d = mod.detail([], state)
    expect(validateDetail(d), JSON.stringify(validateDetail.errors)).toBe(true)
    if (mod.matchStats) {
      const validateStats = ajv.compile(schemas.MatchStats)
      expect(validateStats(mod.matchStats([], state)), JSON.stringify(validateStats.errors)).toBe(true)
    }
  })

  it('X01Detail', () => {
    const s = x01Game.init(
      {
        startScore: 301,
        inMode: 'straight',
        outMode: 'double',
        bullOff: 'off',
        botSpeed: 'normal',
        bullValue: '25_50',
        maxRounds: 50,
        firstTo: 1,
      },
      [{ name: 'A' }],
    )
    const end = { ...s, scores: [241] }
    const d = x01Game.detail(
      [{ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: [dart], start: s, end, after: end }],
      end,
    )
    const validate = ajv.compile(schemas.X01Detail)
    expect(validate(d), JSON.stringify(validate.errors)).toBe(true)
  })
  it('X01 MatchStats', () => {
    const s = x01Game.init(
      {
        startScore: 301,
        inMode: 'straight',
        outMode: 'double',
        bullOff: 'off',
        botSpeed: 'normal',
        bullValue: '25_50',
        maxRounds: 50,
        firstTo: 1,
      },
      [{ name: 'A' }],
    )
    const end = { ...s, scores: [241] }
    const m = x01Game.matchStats!(
      [{ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: [dart], start: s, end, after: end }],
      end,
    )
    const validate = ajv.compile(schemas.MatchStats)
    expect(validate(m), JSON.stringify(validate.errors)).toBe(true)
  })
  it('AtcDetail', () => {
    const s = atcModule.init({ throwAgainOnAllHit: false, finishOn: 'bull', multiplierAdvances: false, order: 'asc' }, [{ name: 'A' }])
    const d = atcModule.detail(
      [{ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: [dart], start: s, end: s, after: s }],
      s,
    )
    const validate = ajv.compile(schemas.AtcDetail)
    expect(validate(d), JSON.stringify(validate.errors)).toBe(true)
  })
  it('ATC MatchStats', () => {
    const s = atcModule.init({ throwAgainOnAllHit: false, finishOn: 'bull', multiplierAdvances: false, order: 'asc' }, [{ name: 'A' }])
    const m = atcModule.matchStats!(
      [{ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: [dart], start: s, end: s, after: s }],
      s,
    )
    const validate = ajv.compile(schemas.MatchStats)
    expect(validate(m), JSON.stringify(validate.errors)).toBe(true)
  })
  it('MinigolfDetail and MatchStats', () => {
    const s0 = minigolfModule.init({ ...minigolfModule.defaultConfig, course: 'test' }, [{ name: 'A' }, { name: 'B' }])
    // The first hole played: A in 2, B in 1
    const s = { ...s0, scores: s0.scores.map((row, i) => (i === 0 ? [2, 1] : row)) }
    const visits = [
      {
        visit: 0,
        seat: 0,
        leg: 0,
        phase: 'game' as const,
        committedAt: '2026-10-01T10:00:00.000Z',
        darts: [dart],
        start: s,
        end: s,
        after: s,
      },
    ]
    const d = minigolfModule.detail(visits, s)
    const validateDetail = ajv.compile(schemas.MinigolfDetail)
    expect(validateDetail(d), JSON.stringify(validateDetail.errors)).toBe(true)
    const m = minigolfModule.matchStats!(visits, s)
    const validateStats = ajv.compile(schemas.MatchStats)
    expect(validateStats(m), JSON.stringify(validateStats.errors)).toBe(true)
    expect(m.seats[1].values).toMatchObject({ holesInOne: 1, avgStrokes: 1 })
  })
  it('P121Detail and MatchStats', () => {
    const p121Cfg: P121Config = {
      startTarget: 121,
      tries: 10,
      dartsPerTry: 9,
      outMode: 'double',
      missRule: 'reset',
      lock: false,
      bullOff: 'off',
    }
    const open: BoardEvent = { kind: 'visit.opened', data: {} }
    const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }
    const p121Dart = (number: number, multiplier: number, index: number): BoardEvent =>
      ({
        kind: 'dart.detected',
        data: {
          visit_id: 'v',
          index,
          dart: { segment: { name: '', number, bed: '', multiplier }, score: number * multiplier },
          source_seq: 1,
        },
      }) as any
    let s = p121Game.init(p121Cfg, [{ name: 'A' }])
    s = p121Game.onBoardEvent(s, open).state
    s = p121Game.onBoardEvent(s, p121Dart(20, 3, 0)).state
    s = p121Game.onBoardEvent(s, p121Dart(11, 3, 1)).state
    s = p121Game.onBoardEvent(s, p121Dart(14, 2, 2)).state
    s = p121Game.onBoardEvent(s, takeout).state
    const d = p121Game.detail([], s)
    const validateDetail = ajv.compile(schemas.P121Detail)
    expect(validateDetail(d), JSON.stringify(validateDetail.errors)).toBe(true)
    const m = p121Game.matchStats!([], s)
    const validateStats = ajv.compile(schemas.MatchStats)
    expect(validateStats(m), JSON.stringify(validateStats.errors)).toBe(true)
  })
  it('HiloDetail and MatchStats', () => {
    const hiloCfg: HiloConfig = {
      startHigh: 41,
      startLow: 21,
      lives: 1,
      t1Zero: false,
      matchExtremes: true,
      keepBarsOnLifeLost: false,
      bullOff: 'off',
    }
    const open: BoardEvent = { kind: 'visit.opened', data: {} }
    const takeoutEvent: BoardEvent = { kind: 'takeout.finished', data: {} }
    const hiloDart = (number: number, multiplier: number, index: number): BoardEvent =>
      ({
        kind: 'dart.detected',
        data: {
          visit_id: 'v',
          index,
          dart: { segment: { name: '', number, bed: '', multiplier }, score: number * multiplier },
          source_seq: 1,
        },
      }) as any
    let s = hiloGame.init(hiloCfg, [{ name: 'A' }, { name: 'B' }])
    s = hiloGame.onBoardEvent(s, open).state
    s = hiloGame.onBoardEvent(s, hiloDart(20, 1, 0)).state
    s = hiloGame.onBoardEvent(s, hiloDart(5, 1, 1)).state
    s = hiloGame.onBoardEvent(s, hiloDart(5, 1, 2)).state // 30, between: A's last life
    s = hiloGame.onBoardEvent(s, takeoutEvent).state
    const d = hiloGame.detail([], s)
    const validateDetail = ajv.compile(schemas.HiloDetail)
    expect(validateDetail(d), JSON.stringify(validateDetail.errors)).toBe(true)
    const m = hiloGame.matchStats!([], s)
    const validateStats = ajv.compile(schemas.MatchStats)
    expect(validateStats(m), JSON.stringify(validateStats.errors)).toBe(true)
  })
  it('CricketDetail and MatchStats', () => {
    const cricketCfg: CricketConfig = { mode: 'standard', firstTo: 1, bullOff: 'off', botSpeed: 'normal', format: 'singles' }
    const open: BoardEvent = { kind: 'visit.opened', data: {} }
    const takeoutEvent: BoardEvent = { kind: 'takeout.finished', data: {} }
    const cricketDart = (number: number, multiplier: number, index: number): BoardEvent =>
      ({
        kind: 'dart.detected',
        data: {
          visit_id: 'v',
          index,
          dart: { segment: { name: '', number, bed: '', multiplier }, score: number * multiplier },
          source_seq: 1,
        },
      }) as any
    let s = cricketGame.init(cricketCfg, [{ name: 'A' }])
    s = cricketGame.onBoardEvent(s, open).state
    s = cricketGame.onBoardEvent(s, cricketDart(20, 3, 0)).state
    s = cricketGame.onBoardEvent(s, cricketDart(20, 3, 1)).state
    s = cricketGame.onBoardEvent(s, cricketDart(20, 1, 2)).state
    s = cricketGame.onBoardEvent(s, takeoutEvent).state
    const d = cricketGame.detail([], s)
    const validateDetail = ajv.compile(schemas.CricketDetail)
    expect(validateDetail(d), JSON.stringify(validateDetail.errors)).toBe(true)
    const m = cricketGame.matchStats!([], s)
    const validateStats = ajv.compile(schemas.MatchStats)
    expect(validateStats(m), JSON.stringify(validateStats.errors)).toBe(true)
  })
})
