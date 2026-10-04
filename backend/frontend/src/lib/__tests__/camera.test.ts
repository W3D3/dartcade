import { describe, it, expect } from 'vitest'
import type { SeatInfo, Snapshot } from '$lib/api/game-ws'
import { cameraIndex, cameraStillUrl } from '../camera.js'
import fixture from './fixtures/x01-snapshot.json'

// Christoph on board-a, Lena on board-b; `currentPlayer` is up
const snap = (o: { currentPlayer?: number; seats?: Partial<SeatInfo>[] } = {}): Snapshot => {
  const base = structuredClone(fixture) as unknown as Snapshot
  return {
    ...base,
    seats: [
      { ...base.seats[0], boardId: 'board-a', boardOnline: true, ...o.seats?.[0] },
      { ...base.seats[1], boardId: 'board-b', boardOnline: true, ...o.seats?.[1] },
    ],
    game: { ...base.game, currentPlayer: o.currentPlayer ?? 0 },
  } as Snapshot
}
const versions = { 'board-a:0': 11, 'board-a:2': 12, 'board-b:0': 21, 'board-a:3': 13 }

describe('cameraIndex', () => {
  it('is null for the drawn board, else the camera (0-based)', () => {
    expect(cameraIndex('svg')).toBeNull()
    expect(cameraIndex('cam1')).toBe(0)
    expect(cameraIndex('cam3')).toBe(2)
    expect(cameraIndex('combined')).toBe(3)
  })
})

describe('cameraStillUrl', () => {
  it('is the chosen camera of the board of the player who is up, by version', () => {
    expect(cameraStillUrl(snap(), 'cam1', versions)).toBe('/api/boards/board-a/camera/0?v=11')
    expect(cameraStillUrl(snap(), 'cam3', versions)).toBe('/api/boards/board-a/camera/2?v=12')
    expect(cameraStillUrl(snap({ currentPlayer: 1 }), 'cam1', versions)).toBe('/api/boards/board-b/camera/0?v=21')
  })

  it('is the combined still as camera 3, with the same fallbacks', () => {
    expect(cameraStillUrl(snap(), 'combined', versions)).toBe('/api/boards/board-a/camera/3?v=13')
    expect(cameraStillUrl(snap({ currentPlayer: 1 }), 'combined', versions)).toBeNull()
    expect(cameraStillUrl(snap({ seats: [{ boardOnline: false }] }), 'combined', versions)).toBeNull()
  })

  it('is null with the drawn board picked, or without a snapshot', () => {
    expect(cameraStillUrl(snap(), 'svg', versions)).toBeNull()
    expect(cameraStillUrl(null, 'cam1', versions)).toBeNull()
  })

  it('is null before that camera sent a still', () => {
    expect(cameraStillUrl(snap(), 'cam2', versions)).toBeNull()
    expect(cameraStillUrl(snap({ currentPlayer: 1 }), 'cam3', versions)).toBeNull()
  })

  it('is null when the player up enters darts by hand or their board is offline', () => {
    expect(cameraStillUrl(snap({ seats: [{ boardId: null }] }), 'cam1', versions)).toBeNull()
    expect(cameraStillUrl(snap({ seats: [{ boardOnline: false }] }), 'cam1', versions)).toBeNull()
  })
})
