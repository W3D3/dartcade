// The camera view: the match screen's board shows a camera's still of the real board (the
// Board Manager straightens it to the board's coordinates) under the usual marks.
// Design: docs/superpowers/specs/2026-10-04-camera-view-design.md
import type { Snapshot } from './api/game-ws'
import type { BoardView } from './gameSettings'
import { upSeat } from './turn'

/** The newest still version per board and camera (keys from cameraKey), from the game socket. */
export type CameraVersions = Partial<Record<string, number>>

export const cameraKey = (boardId: string, cam: number) => `${boardId}:${cam}`

/** The camera (0-based) of a board view; null for the drawn board. */
export function cameraIndex(view: BoardView): number | null {
  switch (view) {
    case 'cam1': return 0
    case 'cam2': return 1
    case 'cam3': return 2
    default: return null
  }
}

/**
 * The still to show under the board: the chosen camera of the board the player who is up
 * throws on (each seat's own board in a remote game). Null, so the drawn board shows, with
 * the drawn board picked, before that camera sent a still, or when the player up enters
 * darts by hand or their board is offline.
 */
export function cameraStillUrl(snap: Snapshot | null, view: BoardView, versions: CameraVersions): string | null {
  const cam = cameraIndex(view)
  if (!snap || cam === null) return null
  const seat = snap.seats.at(upSeat(snap))
  if (!seat?.boardId || !seat.boardOnline) return null
  const version = versions[cameraKey(seat.boardId, cam)]
  if (version === undefined) return null
  return `/api/boards/${encodeURIComponent(seat.boardId)}/camera/${cam}?v=${version}`
}
