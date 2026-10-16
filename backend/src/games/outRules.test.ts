import { describe, it, expect } from 'vitest'
import { scoreDart, meetsMode } from './outRules.js'
import type { Dart } from '../session/types.js'

const dart = (number: number, multiplier: number, name = ''): Dart => {
  let bed: 'SingleInner' | 'SingleOuter' | 'Single' | 'Double' | 'Triple' | 'Outside'
  if (multiplier === 0) bed = 'Outside'
  else if (multiplier === 1) bed = 'Single'
  else if (multiplier === 2) bed = 'Double'
  else bed = 'Triple'
  return { segment: { name, number, bed, multiplier }, score: number * multiplier } as Dart
}

describe('scoreDart', () => {
  it('counts down', () => expect(scoreDart(121, dart(20, 3), 'double', '25_50')).toBe(61))
  it('busts below zero', () => expect(scoreDart(10, dart(20, 1), 'double', '25_50')).toBe('bust'))
  it('busts on a dead-end 1 unless straight out', () => {
    expect(scoreDart(3, dart(2, 1), 'double', '25_50')).toBe('bust')
    expect(scoreDart(3, dart(2, 1), 'straight', '25_50')).toBe(1)
  })
  it('finishes only under the out rule', () => {
    expect(scoreDart(24, dart(12, 2), 'double', '25_50')).toBe(0)
    expect(scoreDart(24, dart(8, 3), 'double', '25_50')).toBe('bust')
    expect(scoreDart(24, dart(8, 3), 'master', '25_50')).toBe(0)
    expect(scoreDart(24, dart(24 / 2, 2), 'straight', '25_50')).toBe(0)
  })
  it('finishes on the bull however it is reported', () => {
    expect(scoreDart(50, dart(50, 1), 'double', '25_50')).toBe(0)
    expect(scoreDart(50, dart(25, 2), 'double', '25_50')).toBe(0)
  })
  it('scores the outer bull 50 with 50/50', () => {
    expect(scoreDart(100, dart(25, 1), 'double', '50_50')).toBe(50)
    expect(scoreDart(100, dart(25, 1), 'double', '25_50')).toBe(75)
  })
  it('a miss scores nothing', () => expect(scoreDart(40, dart(0, 0), 'double', '25_50')).toBe(40))
})

describe('meetsMode', () => {
  it('master takes trebles', () => expect(meetsMode(dart(20, 3), 'master')).toBe(true))
})
