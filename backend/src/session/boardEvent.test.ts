import { describe, it, expect } from 'vitest'
import { parseBoardEvent, readBoardStatus } from './boardEvent.js'

const detected = (dart: unknown) => ({ visit_id: 'v1', index: 0, source_seq: 1, dart })
const segment = { name: 'S20', number: 20, bed: 'SingleInner', multiplier: 1 }

describe('parseBoardEvent', () => {
  it('strips unknown fields from dart data', () => {
    const ev = parseBoardEvent('dart.detected', { ...detected({ segment: { ...segment, x: 1 }, score: 20, extra: 2 }), extra: 3 })
    expect(ev).toEqual({ kind: 'dart.detected', data: detected({ segment, score: 20 }) })
  })

  it.each([
    ['a bounce-out', { segment: { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 }, score: 0, bouncer: true }],
    ['a near-miss', { segment: { name: 'M5', number: 5, bed: 'Outside', multiplier: 0 }, score: 0, coords: { x: 0, y: 1.1 } }],
    ['the outer bull', { segment: { name: '25', number: 25, bed: 'Single', multiplier: 1 }, score: 25 }],
    // How Board Manager (docs/architecture.md) and manual entry report the inner bull
    ['the inner bull', { segment: { name: 'Bull', number: 50, bed: 'Double', multiplier: 1 }, score: 50 }],
  ])('accepts %s', (_, dart) => {
    expect(parseBoardEvent('dart.detected', detected(dart))?.kind).toBe('dart.detected')
  })

  it('rejects dart data outside the schema', () => {
    expect(parseBoardEvent('dart.detected', detected({ segment: { ...segment, bed: 'Weird' }, score: 20 }))).toBeNull()
  })

  it('passes kinds without dart data through and ignores unknown kinds', () => {
    expect(parseBoardEvent('takeout.finished', { anything: 1 })).toEqual({ kind: 'takeout.finished', data: { anything: 1 } })
    expect(parseBoardEvent('motion', {})).toBeNull()
  })
})

describe('readBoardStatus', () => {
  it('reads the fields and defaults each broken one on its own', () => {
    expect(readBoardStatus({ status: 'Throw', running: true, event: 'x' })).toEqual({ status: 'Throw', running: true, event: 'x' })
    expect(readBoardStatus({ status: 'Throw', running: 'yes' })).toEqual({ status: 'Throw', running: false, event: '' })
    expect(readBoardStatus(null)).toEqual({ status: '', running: false, event: '' })
  })
})
