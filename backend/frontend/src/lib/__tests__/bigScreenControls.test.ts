import { describe, it, expect, vi } from 'vitest'
import { bigScreenButton, bigScreenError, bigScreenStatus, BIG_SCREEN_HINT } from '../boards'
import { debounced } from '../utils'
import type { Board } from '../api'

const board = (bigScreen: Partial<Board['bigScreen']> = {}, online = true) =>
  ({ id: 'b1', online, bigScreen: { mode: 'manual', running: false, helper: true, ...bigScreen } }) as Board

describe('bigScreenButton', () => {
  it('is hidden when the setting is off or the flag is', () => {
    expect(bigScreenButton(board({ mode: 'off' }), true)).toEqual({ label: null, action: null, disabled: false, hint: null })
    expect(bigScreenButton(board(), false)).toEqual({ label: null, action: null, disabled: false, hint: null })
  })
  it('starts when stopped and stops when running', () => {
    expect(bigScreenButton(board(), true)).toMatchObject({ label: 'Start big screen', action: 'start', hint: null })
    expect(bigScreenButton(board({ mode: 'auto', running: true }), true)).toMatchObject({ label: 'Stop big screen', action: 'stop' })
  })
  it('hints at the install command when the bridge is online without a helper', () => {
    expect(bigScreenButton(board({ helper: false }), true).hint).toBe(BIG_SCREEN_HINT)
    expect(bigScreenButton(board({ helper: false }, false), true).hint).toBeNull()
  })
})

describe('offline and errors', () => {
  it('Start is disabled offline, Stop is not', () => {
    expect(bigScreenButton(board({}, false), true).disabled).toBe(true)
    expect(bigScreenButton(board({ running: true }, false), true)).toMatchObject({ action: 'stop', disabled: false })
  })
  it('a 409 shows the server text', () => {
    expect(bigScreenError(409, 'Board is offline')).toBe('Board is offline')
    expect(bigScreenError(409)).toMatch(/cannot start/)
  })
  it('debounced collapses a burst', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounced(fn, 100)
    d.call()
    d.call()
    vi.advanceTimersByTime(150)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('bigScreenStatus', () => {
  it('says what the monitor is doing', () => {
    expect(bigScreenStatus(board({ running: true }))).toEqual({ text: 'Showing on the monitor', running: true })
    expect(bigScreenStatus(board())).toEqual({ text: 'Stopped', running: false })
    expect(bigScreenStatus(board({}, false)).text).toBe('Board offline')
  })
})
