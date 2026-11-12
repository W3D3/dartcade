import { describe, it, expect } from 'vitest'
import {
  NOT_REACHABLE,
  RINGED,
  SPINNING,
  bmDotColor,
  bmShortLabel,
  bmStatusLabel,
  commandError,
  polledStatus,
  shownStatus,
} from '../boardStatus.js'

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

describe('polledStatus', () => {
  const running = { status: 'Throw', running: true, event: null }

  it("is Board Manager's status when it answered", () => {
    expect(polledStatus(running, 200)).toBe(running)
  })

  it('says the Board Manager is not reachable when the bridge could not reach it or did not answer, with a red dot', () => {
    for (const code of [502, 503]) {
      const s = polledStatus(undefined, code)
      expect(s).toEqual({ status: NOT_REACHABLE, running: false, event: null })
      expect(bmDotColor(s!.status, true)).toBe('red')
      expect(bmStatusLabel(s!.status, true)).toBe('Board Manager not reachable')
    }
  })

  it('knows nothing on any other failure', () => {
    expect(polledStatus(undefined, 500)).toBeNull()
  })
})

describe('shownStatus', () => {
  const running = { status: 'Throw', running: true, event: null }

  it('is not reachable once the bridge says it lost its Board Manager, whatever the last poll said', () => {
    expect(shownStatus(running, false)?.status).toBe(NOT_REACHABLE)
  })

  it('is the poll otherwise, also for a bridge that does not say (null)', () => {
    expect(shownStatus(running, true)).toBe(running)
    expect(shownStatus(running, null)).toBe(running)
    expect(shownStatus(null, null)).toBeNull()
  })
})

describe('commandError', () => {
  it('names what did not answer', () => {
    expect(commandError(502)).toMatch(/Board Manager/)
    expect(commandError(503)).toMatch(/bridge/)
    expect(commandError(undefined)).toMatch(/try again/i)
  })
})
