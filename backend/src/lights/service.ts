// Drives WLED lights as games change (#135): derives triggers from snapshot pushes (Task 7),
// matches them against the built-in profile (Task 6) and sends `wled.apply`/`wled.devices`
// messages to each board's bridge. Also handles takeout, game end, bridge hello and device
// changes. Never throws into the engine's push/event path: every send is wrapped.
import type { WledDeviceRow } from '../db/lights.js'
import type { Snapshot } from '../schema/game-ws.js'
import {
  DEFAULT_PROFILE,
  match,
  patchFor,
  type BoardTrigger,
  type GameId,
  type LightDevice,
  type Rule,
  type SeatLayout,
  type Trigger,
  type TriggerKind,
} from '../shared/lights/index.js'
import { triggersFor } from './triggers/index.js'
import { supportsLights } from './version.js'

export type LightsDeps = {
  send: (boardId: string, msg: object) => boolean
  bridgeVersion: (boardId: string) => string | null | undefined
  devices: (boardId: string) => Promise<WledDeviceRow[]>
  enabled: (boardId: string) => Promise<boolean>
  getSession: (sessionId: string) => { boardId: string | null; seats: { boardId: string | null }[] } | undefined
  getSnapshot: (sessionId: string) => Snapshot | undefined
  /** The active session id on the board, if any. */
  sessionOnBoard: (boardId: string) => string | null
  warn: (msg: string, details?: unknown) => void
}

type SessionLike = { boardId: string | null; seats: { boardId: string | null }[] }
/** The scene last shown on a board, remembered so a reconnect or a takeout can bring it back. */
type RememberedScene = { t: BoardTrigger; game: GameId | null; layout: SeatLayout }

const toLightDevice = (d: WledDeviceRow): LightDevice => ({ leds: d.leds, segmentMode: d.segment_mode, segments: d.segments })

const boardsOf = (s: SessionLike): string[] => [
  ...new Set([s.boardId, ...s.seats.map(x => x.boardId)].filter((b): b is string => b !== null)),
]

const isLocal = (s: SessionLike, seat: number, board: string): boolean => (s.seats[seat]?.boardId ?? s.boardId) === board

const isTurn = (t: Trigger): t is Trigger & { kind: 'turn'; seat: number } => t.kind === 'turn'

/** Seats in the view, for games whose session has no seats of its own (a local game). */
function seatCountOf(snap: Snapshot): number {
  switch (snap.gameId) {
    case 'x01':
      return snap.game.scores.length
    case 'atc':
      return snap.game.targets.length
    case 'p121':
    case 'hilo':
      return snap.game.seats.length
    case 'minigolf':
      return snap.game.balls.length
  }
}

function layoutFor(session: SessionLike, snap: Snapshot): SeatLayout {
  const seatCount = session.seats.length || seatCountOf(snap)
  const teams = snap.gameId === 'x01' ? snap.game.teams?.map(t => t.seats) : undefined
  return { seatCount, teams }
}

/** A trigger to show for `test()`: seat 0, a round total for `visit`, a sample target/strokes. */
function sampleTrigger(kind: TriggerKind): Trigger {
  switch (kind) {
    case 'idle':
    case 'takeout.started':
    case 'takeout.finished':
      return { kind }
    case 'visit':
      return { kind, seat: 0, total: 180 }
    case 'atc.hit':
      return { kind, seat: 0, target: 20 }
    case 'golf.sunk':
      return { kind, seat: 0, strokes: 3 }
    default:
      return { kind, seat: 0 }
  }
}

export class LightsService {
  /** The last snapshot pushed for a session, to diff the next push against. */
  private last = new Map<string, Snapshot>()
  /** The scene currently shown on a board, so a reconnect or a takeout can bring it back. */
  private scene = new Map<string, RememberedScene>()
  /** Every board-affecting call is chained on its board's queue, so sends land in call order,
   *  never completion order (a takeout racing the push that changed the turn, a slow devices()
   *  call racing a faster later one, onGameEnded racing an in-flight scene fire, …). */
  private queues = new Map<string, Promise<void>>()

  constructor(private readonly deps: LightsDeps) {}

  async onPush(sessionId: string): Promise<void> {
    const session = this.deps.getSession(sessionId)
    const after = this.deps.getSnapshot(sessionId)
    if (!session || !after) return
    const before = this.last.get(sessionId) ?? null
    this.last.set(sessionId, after)
    const triggers = triggersFor(before, after)
    if (triggers.length === 0) return
    const boards = boardsOf(session)
    const layout = layoutFor(session, after)
    // Enqueued synchronously (no await above this point), so a board's position in its queue
    // matches push order, whatever order the triggers' devices()/enabled() calls settle in.
    await Promise.all(
      boards.map(board =>
        this.enqueue(board, async () => {
          for (const trigger of triggers) {
            const local = 'seat' in trigger ? isLocal(session, trigger.seat, board) : true
            await this.fire(board, { ...trigger, local }, after.gameId, layout)
          }
        }),
      ),
    )
  }

  /** Boards go idle (after the win flash). */
  async onGameEnded(sessionId: string): Promise<void> {
    const session = this.deps.getSession(sessionId)
    if (!session) return
    await Promise.all(
      boardsOf(session).map(board =>
        this.enqueue(board, async () => {
          this.scene.delete(board)
          await this.fire(board, { kind: 'idle', local: true }, null, { seatCount: 1 })
        }),
      ),
    )
  }

  onForgotten(sessionId: string): void {
    this.last.delete(sessionId)
  }

  async onBoardEvent(boardId: string, kind: string): Promise<void> {
    if (kind === 'takeout.started') {
      return this.enqueue(boardId, () => this.fire(boardId, { kind: 'takeout.started', local: true }, null, { seatCount: 1 }))
    }
    if (kind === 'takeout.finished') {
      return this.enqueue(boardId, () => this.resendOrIdle(boardId))
    }
  }

  /** The bridge said hello: devices, then the current scene. Nothing while lights are off (a fresh bridge has an empty allowlist). */
  async onBridgeHello(boardId: string): Promise<void> {
    return this.enqueue(boardId, async () => {
      if (!(await this.deps.enabled(boardId))) return
      await this.sendDevicesAndScene(boardId)
    })
  }

  /** Same as onBridgeHello, except lights off darkens the strip and clears the allowlist instead of sending nothing. */
  async devicesChanged(boardId: string): Promise<void> {
    return this.enqueue(boardId, async () => {
      if (!(await this.deps.enabled(boardId))) {
        await this.darken(boardId)
        return
      }
      await this.sendDevicesAndScene(boardId)
    })
  }

  /** Plays a profile rule for the API's Test button. False: no such rule, an unsupported/offline bridge, or nothing could be sent. */
  async test(boardId: string, ruleIndex: number): Promise<boolean> {
    const rule = DEFAULT_PROFILE.rules.at(ruleIndex)
    if (!rule) return false
    if (!supportsLights(this.deps.bridgeVersion(boardId))) return false
    const t: BoardTrigger = { ...sampleTrigger(rule.when.trigger), local: true }
    let devices: WledDeviceRow[]
    try {
      devices = await this.deps.devices(boardId)
    } catch (err) {
      this.deps.warn('lights test failed', err)
      return false
    }
    if (devices.length === 0) return false
    for (const device of devices) this.send(boardId, device, rule, t, { seatCount: 1 }, rule.type === 'flash' ? rule.holdMs : 3000)
    return true
  }

  /** Chains `task` on `board`'s queue: it runs after every earlier call for this board has settled,
   *  in the order they were enqueued (not the order their internal awaits happen to resolve), and
   *  the queue itself never rejects (a failing task is warned and the chain moves on). */
  private enqueue(board: string, task: () => Promise<void>): Promise<void> {
    const chain = (this.queues.get(board) ?? Promise.resolve()).then(task).catch((err: unknown) => {
      this.deps.warn('lights queue failed', err)
    })
    this.queues.set(board, chain)
    return chain
  }

  private async resendOrIdle(boardId: string): Promise<void> {
    const remembered = this.scene.get(boardId)
    if (remembered) await this.fire(boardId, remembered.t, remembered.game, remembered.layout)
    else await this.fire(boardId, { kind: 'idle', local: true }, null, { seatCount: 1 })
  }

  private async sendDevicesAndScene(boardId: string): Promise<void> {
    if (!supportsLights(this.deps.bridgeVersion(boardId))) return
    try {
      const devices = await this.deps.devices(boardId)
      this.deps.send(boardId, {
        kind: 'wled.devices',
        data: { devices: devices.map(d => ({ id: d.id, mac: d.mac, host: d.host, max_bri: d.max_bri })) },
      })
    } catch (err) {
      this.deps.warn('lights devices send failed', err)
    }
    const remembered = this.scene.get(boardId)
    if (remembered) {
      await this.fire(boardId, remembered.t, remembered.game, remembered.layout)
      return
    }
    const sessionId = this.deps.sessionOnBoard(boardId)
    const session = sessionId ? this.deps.getSession(sessionId) : undefined
    const snapshot = sessionId ? this.deps.getSnapshot(sessionId) : undefined
    const turn = snapshot ? triggersFor(null, snapshot).find(isTurn) : undefined
    if (session && snapshot && turn) {
      const layout = layoutFor(session, snapshot)
      await this.fire(boardId, { ...turn, local: isLocal(session, turn.seat, boardId) }, snapshot.gameId, layout)
      return
    }
    await this.fire(boardId, { kind: 'idle', local: true }, null, { seatCount: 1 })
  }

  /** Lights off: darken every device, then clear the bridge's allowlist. */
  private async darken(boardId: string): Promise<void> {
    try {
      const devices = await this.deps.devices(boardId)
      for (const d of devices) this.deps.send(boardId, { kind: 'wled.apply', data: { device_id: d.id, state: { on: false } } })
      this.deps.send(boardId, { kind: 'wled.devices', data: { devices: [] } })
    } catch (err) {
      this.deps.warn('lights darken failed', err)
    }
  }

  /** Lights off, an unsupported/offline bridge or no devices: nothing to send. Otherwise sends the matching rule to every device. */
  private async fire(board: string, t: BoardTrigger, game: GameId | null, layout: SeatLayout): Promise<void> {
    try {
      if (!(await this.deps.enabled(board))) return
      if (!supportsLights(this.deps.bridgeVersion(board))) return
      const devices = await this.deps.devices(board)
      if (devices.length === 0) return
      const rule = match(DEFAULT_PROFILE, t, game)
      if (!rule) return
      for (const device of devices) this.send(board, device, rule, t, layout, rule.type === 'flash' ? rule.holdMs : undefined)
      if (rule.type === 'scene' && t.kind !== 'takeout.started') this.scene.set(board, { t, game, layout })
    } catch (err) {
      this.deps.warn('lights fire failed', err)
    }
  }

  /** Sends one device's wled.apply; a thrown error is logged, never raised into the engine path. */
  private send(board: string, device: WledDeviceRow, rule: Rule, t: BoardTrigger, layout: SeatLayout, holdMs: number | undefined): void {
    try {
      this.deps.send(board, {
        kind: 'wled.apply',
        data: { device_id: device.id, state: patchFor(rule, t, toLightDevice(device), layout), hold_ms: holdMs },
      })
    } catch (err) {
      this.deps.warn('lights send failed', err)
    }
  }
}
