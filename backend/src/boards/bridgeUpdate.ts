// The Update bridge button's progress per board: asked for here, reported by the bridge
// (bridge.update.status), finished when it says hello again with the new version.
import type { components } from '../schema/api.js'
import type { z } from 'zod'
import type { BridgeUpdateStatusMessageSchema } from '../schema/zod.js'

export type BridgeUpdateStatus = components['schemas']['BridgeUpdateStatus']
type BridgeUpdateStatusData = z.output<typeof BridgeUpdateStatusMessageSchema>['data']

// Without word from the bridge for this long, an update in flight counts as failed: longer than
// the 10 minutes a bridge allows its download (bridge/internal/update), so a slow one isn't cut short
const STALE_MS = 12 * 60 * 1000

const IN_FLIGHT: ReadonlySet<BridgeUpdateStatus['phase']> = new Set(['requested', 'downloading', 'verifying', 'installing', 'restarting'])

export class BridgeUpdates {
  private byBoard = new Map<string, BridgeUpdateStatus & { at: number }>()

  constructor(private now: () => number = Date.now) {}

  /** The board's last update since the server started, or null. */
  get(boardId: string): BridgeUpdateStatus | null {
    const s = this.byBoard.get(boardId)
    if (!s) return null
    const { at, ...status } = s
    if (IN_FLIGHT.has(status.phase) && this.now() - at > STALE_MS)
      return { ...status, phase: 'failed', error: 'The bridge stopped answering during the update' }
    return status
  }

  inFlight(boardId: string): boolean {
    const s = this.get(boardId)
    return s !== null && IN_FLIGHT.has(s.phase)
  }

  request(boardId: string, version: string): BridgeUpdateStatus {
    return this.set(boardId, { version, phase: 'requested', error: null })
  }

  /** A bridge.update.status from the board's bridge. */
  report(boardId: string, data: BridgeUpdateStatusData): void {
    this.set(boardId, { version: data.version, phase: data.phase, error: data.phase === 'failed' ? (data.error ?? 'Unknown error') : null })
  }

  /** The board's bridge said hello: an update in flight is done if it came back with the new version. */
  hello(boardId: string, bridgeVersion: string | null): void {
    const s = this.byBoard.get(boardId)
    if (!s || !IN_FLIGHT.has(s.phase)) return
    if (bridgeVersion === s.version) this.set(boardId, { version: s.version, phase: 'done', error: null })
    // Before restarting, a hello is only the socket reconnecting: the update goes on
    else if (s.phase === 'restarting')
      this.set(boardId, { version: s.version, phase: 'failed', error: `The bridge restarted on ${bridgeVersion ?? 'an unknown version'}` })
  }

  private set(boardId: string, status: BridgeUpdateStatus): BridgeUpdateStatus {
    this.byBoard.set(boardId, { ...status, at: this.now() })
    return status
  }
}

export const bridgeUpdates = new BridgeUpdates()
