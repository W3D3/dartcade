// The latest camera still per board and camera, in memory only (nothing in the DB or the
// event log). The bridge sends a new one after each dart, correction, takeout and resync.
// Design: docs/superpowers/specs/2026-10-04-camera-view-design.md

/** Bigger stills are dropped (the bridge sends 600×600 JPEGs of about 30–50 KB). */
export const MAX_STILL_BYTES = 1024 * 1024

export type Still = { version: number; bytes: Buffer; contentType: string; capturedAt: string }

export class CameraStills {
  private stills = new Map<string, Map<number, Still>>()
  // One counter for every still, starting at the clock: versions go up per board and camera,
  // and stay above the last run's after a restart, so a cached `?v=` URL never shows an old picture
  private counter: number

  constructor(now: () => number = Date.now) {
    this.counter = now()
  }

  /** Stores a still; its version, or null when it was dropped (too big). */
  put(boardId: string, cam: number, still: Omit<Still, 'version'>): number | null {
    if (still.bytes.length > MAX_STILL_BYTES) return null
    let board = this.stills.get(boardId)
    if (!board) { board = new Map(); this.stills.set(boardId, board) }
    const version = ++this.counter
    board.set(cam, { version, ...still })
    return version
  }

  get(boardId: string, cam: number): Still | undefined {
    return this.stills.get(boardId)?.get(cam)
  }

  /** Forgets the board's stills (bridge gone, board deleted): a board back online sends fresh ones. */
  clear(boardId: string): void {
    this.stills.delete(boardId)
  }

  /** The board's stills, by camera. */
  versions(boardId: string): { cam: number; version: number }[] {
    return [...this.stills.get(boardId) ?? []]
      .map(([cam, s]) => ({ cam, version: s.version }))
      .sort((a, b) => a.cam - b.cam)
  }
}

export const cameraStills = new CameraStills()
