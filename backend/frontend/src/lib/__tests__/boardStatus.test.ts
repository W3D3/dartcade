import { describe, it, expect } from 'vitest'
import { bmDotColor, bmStatusLabel } from '../boardStatus.js'

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
