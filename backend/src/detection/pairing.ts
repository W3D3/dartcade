// Pairs a camera dart with the stills that show it: each camera's still after the dart, and the
// same camera's still from the round before (after the previous dart, the takeout or a resync).
// The bridge tags every still with the bm.frame seq of the event batch it followed (source_seq)
// and of the round before (previous_seq), and a dart.detected carries its batch's seq as its
// source_seq, so nothing here depends on the order stills and events arrive in.
// Design: docs/superpowers/specs/2026-10-31-dart-detection-model-design.md

// shortcut: only boards with exactly three cameras (Board Manager's maximum and the usual setup)
// give samples; one with fewer would need the model to take fewer views
export const CAMS = [0, 1, 2] as const

/** How many rounds of stills and darts are kept per board while their partners may still come: a
 *  dart needs its own round and the one before, plus one of slack (about 1 MB of stills a board). */
const KEEP = 3

export type PairStill = { cam: number; sourceSeq: number; previousSeq: number | null; jpeg: Buffer }
export type PairDart = { sourceSeq: number; bridgeEventId: string; bmVersion: string | null }
export type Sample = PairDart & { boardId: string; before: Buffer[]; after: Buffer[] }

type Board = {
  /** Stills by `${sourceSeq}:${cam}`, oldest first. */
  stills: Map<string, PairStill>
  /** Darts waiting for their stills, by source_seq. */
  darts: Map<number, PairDart>
}

export class SamplePairing {
  private boards = new Map<string, Board>()

  /** A still arrived; the sample it completes, if any. */
  addStill(boardId: string, still: PairStill): Sample | null {
    const b = this.board(boardId)
    const key = `${still.sourceSeq}:${still.cam}`
    b.stills.delete(key)
    b.stills.set(key, still)
    trim(b.stills, KEEP * CAMS.length)
    return this.complete(boardId, b, still.sourceSeq)
  }

  /** A dart.detected was stored; the sample it completes, if any. */
  addDart(boardId: string, dart: PairDart): Sample | null {
    const b = this.board(boardId)
    b.darts.set(dart.sourceSeq, dart)
    trim(b.darts, KEEP)
    return this.complete(boardId, b, dart.sourceSeq)
  }

  /** Forgets the board (its bridge went away): stills from before it are no longer comparable. */
  clear(boardId: string): void {
    this.boards.delete(boardId)
  }

  private complete(boardId: string, b: Board, seq: number): Sample | null {
    const dart = b.darts.get(seq)
    if (!dart) return null
    const after = CAMS.map(cam => b.stills.get(`${seq}:${cam}`)).filter(isStill)
    // A camera whose round was coalesced, or a still dropped while the backend was away, has no
    // before still: that dart is skipped, not repaired
    const before = after.map(st => (st.previousSeq ? b.stills.get(`${st.previousSeq}:${st.cam}`) : undefined)).filter(isStill)
    if (after.length < CAMS.length || before.length < CAMS.length) return null
    b.darts.delete(seq)
    return { ...dart, boardId, before: before.map(s => s.jpeg), after: after.map(s => s.jpeg) }
  }

  private board(boardId: string): Board {
    let b = this.boards.get(boardId)
    if (!b) {
      b = { stills: new Map(), darts: new Map() }
      this.boards.set(boardId, b)
    }
    return b
  }
}

const isStill = (s: PairStill | undefined): s is PairStill => s !== undefined

// Drops the oldest entries past max (a Map iterates in insertion order)
function trim<K, V>(m: Map<K, V>, max: number): void {
  for (const k of m.keys()) {
    if (m.size <= max) return
    m.delete(k)
  }
}
