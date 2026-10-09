import { describe, it, expect } from 'vitest'
import { Ajv } from 'ajv'
import addFormatsModule from 'ajv-formats'
import spec from '../schema/api-v1.deref.json' with { type: 'json' }
import { x01Game } from './x01.js'
import { atcModule } from './atc.js'
import { minigolfModule } from './minigolf.js'

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
})
