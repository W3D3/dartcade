// Keeps camera darts as training data for the dart detection model: stills and dart.detected
// events from the bridge go into the pairing, and each complete sample is stored when its board
// shares. Never in a game's way: every failure is logged and the sample dropped.
// Design: docs/superpowers/specs/2026-10-31-dart-detection-model-design.md
import { z } from 'zod'
import { CAMS, SamplePairing, type Sample } from './pairing.js'

type Opts = {
  /** Whether the board's samples are kept now (its setting, the flag for its owner). */
  shares: (boardId: string) => Promise<boolean>
  save: (sample: Sample) => Promise<void>
  warn: (message: string, details: Record<string, unknown>) => void
}

// Only the batch seq matters here; the event was checked against the schema when it was stored
const DartDetected = z.object({ source_seq: z.number().int().positive() })

export class SampleCollector {
  private pairing = new SamplePairing()

  constructor(private opts: Opts) {}

  /** A camera still from the bridge (only stills of the three cameras, fetched after an event). */
  still(boardId: string, still: { cam: number; source_seq?: number; previous_seq?: number }, jpeg: Buffer): void {
    if (!CAMS.some(cam => cam === still.cam) || !still.source_seq) return
    this.take(
      this.pairing.addStill(boardId, { cam: still.cam, sourceSeq: still.source_seq, previousSeq: still.previous_seq ?? null, jpeg }),
    )
  }

  /** A stored bridge event; only dart.detected matters. */
  event(boardId: string, kind: string, data: unknown, bridgeEventId: string, bmVersion: string | null): void {
    if (kind !== 'dart.detected') return
    const dart = DartDetected.safeParse(data)
    if (!dart.success) return
    this.take(this.pairing.addDart(boardId, { sourceSeq: dart.data.source_seq, bridgeEventId, bmVersion }))
  }

  /** The board's bridge is gone: what it sent before can't be paired with what it sends next. */
  clear(boardId: string): void {
    this.pairing.clear(boardId)
  }

  private take(sample: Sample | null): void {
    if (!sample) return
    this.store(sample).catch((err: unknown) => {
      this.opts.warn('dart sample not stored', { boardId: sample.boardId, bridgeEventId: sample.bridgeEventId, error: String(err) })
    })
  }

  private async store(sample: Sample): Promise<void> {
    if (await this.opts.shares(sample.boardId)) await this.opts.save(sample)
  }
}

/** DART_SAMPLES_MAX_GB: how much the stills may take (default 20 GB); 0 turns collection off. */
export function maxSampleBytes(env: NodeJS.ProcessEnv = process.env): number {
  const gb = Number(env.DART_SAMPLES_MAX_GB ?? 20)
  return Number.isFinite(gb) && gb > 0 ? Math.round(gb * 1024 ** 3) : 0
}
