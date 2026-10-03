import { describe, it, expect } from 'vitest'
import type { Snapshot } from '$lib/api'
import { endControl } from '../endControl.js'
import fixture from './fixtures/x01-snapshot.json'

const snap = (patch: { ownerUserId?: string; mySeats?: number[] } = {}): Snapshot => {
  const base = structuredClone(fixture) as unknown as Snapshot
  return { ...base, ownerUserId: patch.ownerUserId ?? base.ownerUserId, mySeats: patch.mySeats ?? base.mySeats }
}

describe('endControl', () => {
  it('gives the host End', () => {
    expect(endControl(snap({ ownerUserId: 'host', mySeats: [0] }), 'host')).toBe('end')
  })

  it('gives a seated non-host Leave', () => {
    expect(endControl(snap({ ownerUserId: 'host', mySeats: [1] }), 'guest')).toBe('leave')
  })

  it('gives a seatless watcher neither', () => {
    expect(endControl(snap({ ownerUserId: 'host', mySeats: [] }), 'watcher')).toBeNull()
  })

  it('gives a signed-out viewer Leave if seated, never End', () => {
    expect(endControl(snap({ ownerUserId: 'host', mySeats: [1] }), null)).toBe('leave')
  })

  it('nobody acts without a snapshot', () => {
    expect(endControl(null, 'host')).toBeNull()
  })
})
