import { describe, it, expect } from 'vitest'
import { historyHref, paramUrl, readParam, rememberHistoryUrl } from '../urlState.js'

describe('readParam', () => {
  const allowed = ['all', 'online'] as const
  it('reads an allowed value', () => expect(readParam('tab=online', 'tab', allowed, 'all')).toBe('online'))
  it('falls back on an unknown or missing value', () => {
    expect(readParam('tab=nope', 'tab', allowed, 'all')).toBe('all')
    expect(readParam('', 'tab', allowed, 'all')).toBe('all')
    expect(readParam(undefined, 'tab', allowed, null)).toBeNull()
  })
})

describe('paramUrl', () => {
  it('sets a param and keeps the others', () => expect(paramUrl('/history', 'a=1', 'mode', 'x01')).toBe('/history?a=1&mode=x01'))
  it('leaves the default out of the URL', () => {
    expect(paramUrl('/history', 'mode=x01', 'mode', null)).toBe('/history')
    expect(paramUrl('/history', 'a=1&mode=x01', 'mode', null)).toBe('/history?a=1')
  })
})

describe('round trip', () => {
  it('a filter written to the URL reads back after coming back from a details page', () => {
    const modes = ['x01', 'atc'] as const
    const url = paramUrl('/history', '', 'mode', 'x01')
    const qs = url.split('?')[1]
    expect(readParam(qs, 'mode', modes, null)).toBe('x01')
    expect(readParam(paramUrl('/history', qs, 'mode', null).split('?')[1], 'mode', modes, null)).toBeNull()
  })
})

describe('historyHref', () => {
  const store = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }
  it('is the plain list until a list URL is remembered', () => expect(historyHref(store())).toBe('#/history'))
  it('leads back to the remembered filter', () => {
    const s = store()
    rememberHistoryUrl(s, 'mode=x01')
    expect(historyHref(s)).toBe('#/history?mode=x01')
    rememberHistoryUrl(s, '')
    expect(historyHref(s)).toBe('#/history')
  })
  it('ignores a remembered value that is not the History list', () => {
    const s = store()
    s.setItem('dartcade:history-url', '#/admin')
    expect(historyHref(s)).toBe('#/history')
  })
  it('works without storage', () => expect(historyHref(null)).toBe('#/history'))
})

describe('period and panel params', () => {
  it('reads the period and the panel tab with their defaults', () => {
    expect(readParam('period=weekly', 'period', ['weekly'] as const, 'daily')).toBe('weekly')
    expect(readParam('', 'period', ['weekly'] as const, 'daily')).toBe('daily')
    expect(readParam('panel=history', 'panel', ['history'] as const, 'friends')).toBe('history')
  })
})
