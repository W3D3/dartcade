import { describe, it, expect } from 'vitest'
import { RINGED, SPINNING, bmDotColor, bmShortLabel, bmStatusLabel } from '../boardStatus.js'

describe('bmDotColor', () => {
  it('is gray while the board is offline, whatever its last status', () => {
    expect(bmDotColor('Running', false)).toBe('gray')
  })

  it('colours the Board Manager states', () => {
    expect(['Running', 'Throw', 'Starting'].map(s => bmDotColor(s, true))).toEqual(['green', 'green', 'green'])
    expect(['Takeout', 'Takeout in progress', 'Stopping'].map(s => bmDotColor(s, true))).toEqual(['yellow', 'yellow', 'yellow'])
    expect(['Calibrating', 'Setup'].map(s => bmDotColor(s, true))).toEqual(['purple', 'purple'])
    expect(['Stopped', 'Error', 'Offline'].map(s => bmDotColor(s, true))).toEqual(['red', 'red', 'red'])
  })

  it('is gray for no status or one it does not know', () => {
    expect(bmDotColor(null, true)).toBe('gray')
    expect(bmDotColor('Something new', true)).toBe('gray')
  })
})

describe('bmStatusLabel', () => {
  it('is the status, a dash while an online board has none, Offline for an offline one', () => {
    expect(bmStatusLabel('Takeout', true)).toBe('Takeout')
    expect(bmStatusLabel(null, true)).toBe('—')
    expect(bmStatusLabel(null, false)).toBe('Offline')
  })
})

describe('busy states', () => {
  it('rings the dot while taking out or calibrating, and spins only while starting or stopping', () => {
    expect([...RINGED].sort()).toEqual(['Calibrating', 'Takeout in progress'])
    expect([...SPINNING].sort()).toEqual(['Starting', 'Stopping'])
    expect([...RINGED].filter(s => SPINNING.has(s))).toEqual([])
  })
})

describe('bmShortLabel', () => {
  it('drops "in progress" and leaves the other labels', () => {
    expect(bmShortLabel('Takeout in progress', true)).toBe('Takeout')
    expect(bmShortLabel('Calibrating', true)).toBe('Calibrating')
    expect(bmShortLabel(null, false)).toBe('Offline')
  })
})
