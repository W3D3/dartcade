import { describe, it, expect } from 'vitest'
import { applyBoardStatus, bmHost, bridgeUpdateView, fmtDate, fmtVersion, selectedLine } from '../boards.js'
import type { Board } from '../api'

const board = (over: Partial<Board> = {}): Board => ({
  id: 'b1',
  name: 'Living room',
  hardwareId: null,
  online: true,
  bridgeVersion: '0.4.2',
  bmVersion: null,
  createdAt: '2026-08-12T10:00:00.000Z',
  ip: '192.168.1.42',
  bmUrl: 'http://192.168.1.42:3180',
  bridgeUpdate: { available: null, updatable: true },
  bigScreen: { mode: 'off', running: false, helper: false },
  sharedBy: null,
  ...over,
})

describe('board text', () => {
  it('versions, hosts and dates', () => {
    expect(fmtVersion('0.4.2')).toBe('v0.4.2')
    expect(fmtVersion('v0.4.2')).toBe('v0.4.2')
    expect(fmtVersion('dev')).toBe('dev')
    expect(fmtVersion(null)).toBeNull()
    expect(bmHost(board())).toBe('192.168.1.42:3180')
    expect(bmHost(board({ bmUrl: null }))).toBe('192.168.1.42')
    expect(fmtDate('2026-08-12T10:00:00.000Z')).toBe('12 Aug 2026')
    expect(fmtDate(null)).toBe('—')
  })

  it('the Selected bar: bridge, connection and when it was paired', () => {
    expect(selectedLine(board())).toBe('Bridge v0.4.2 · connected · paired 12 Aug 2026')
    expect(selectedLine(board({ online: false, bridgeVersion: null }))).toBe('Bridge offline · paired 12 Aug 2026')
  })
})

describe('a board.status push', () => {
  it('marks a board that dropped offline, and leaves the others', () => {
    const list = [board(), board({ id: 'b2' })]
    expect(applyBoardStatus(list, { boardId: 'b1', online: false })).toEqual([board({ online: false }), board({ id: 'b2' })])
  })

  it('refetches for a board that came online (new versions) or one the list does not have yet', () => {
    expect(applyBoardStatus([board({ online: false })], { boardId: 'b1', online: true })).toBe('refetch')
    expect(applyBoardStatus([board()], { boardId: 'new', online: false })).toBe('refetch')
  })
})

describe('bridgeUpdateView', () => {
  const update = (u: Partial<Board['bridgeUpdate']>, over: Partial<Board> = {}) =>
    bridgeUpdateView(board({ bridgeUpdate: { available: null, updatable: true, ...u }, ...over }))

  it('offers the button only for an online bridge that can update itself', () => {
    expect(update({})).toEqual({ kind: 'none' })
    expect(update({ available: 'v0.9.2' })).toEqual({ kind: 'available', version: 'v0.9.2', canUpdate: true, error: null })
    expect(update({ available: 'v0.9.2', updatable: false })).toMatchObject({ canUpdate: false })
    expect(update({ available: 'v0.9.2' }, { online: false })).toMatchObject({ canUpdate: false })
  })

  it('shows the progress, the result and a failure', () => {
    expect(update({ available: 'v0.9.2', status: { version: 'v0.9.2', phase: 'verifying', error: null } })).toEqual({
      kind: 'busy',
      text: 'Verifying v0.9.2…',
    })
    expect(update({ status: { version: 'v0.9.2', phase: 'done', error: null } })).toEqual({ kind: 'done', text: 'Updated to v0.9.2' })
    expect(update({ available: 'v0.9.2', status: { version: 'v0.9.2', phase: 'failed', error: 'checksum mismatch' } })).toEqual({
      kind: 'available',
      version: 'v0.9.2',
      canUpdate: true,
      error: 'Update to v0.9.2 failed: checksum mismatch',
    })
    // Still shown once the bridge is offline and nothing is on offer
    expect(update({ status: { version: 'v0.9.2', phase: 'failed', error: 'checksum mismatch' } })).toEqual({
      kind: 'failed',
      text: 'Update to v0.9.2 failed: checksum mismatch',
    })
  })
})
