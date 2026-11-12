// Drives WLED lights as games change (#135): derives triggers from snapshot pushes (Task 7),
// matches them against the built-in profile (Task 6) and sends `wled.apply`/`wled.devices`
// messages to each board's bridge. Also handles takeout, game end, bridge hello and device
// changes. Never throws into the engine's push/event path: every send is wrapped.
import type { WledDeviceRow } from '../db/lights.js'
import type { Snapshot } from '../schema/game-ws.js'
import {
  CALIBRATED_HOLD_MS,
  match,
  patchFor,
  type BoardTrigger,
  type GameId,
  type LightDevice,
  type Profile,
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
  /** What the board's lights run: its selected profile, the built-in one when it has none. */
  profile: (boardId: string) => Promise<Profile>
  enabled: (boardId: string) => Promise<boolean>
  getSession: (sessionId: string) => { boardId: string | null; seats: { boardId: string | null }[] } | undefined
  getSnapshot: (sessionId: string) => Snapshot | undefined
  /** The active session id on the board, if any. */
  sessionOnBoard: (boardId: string) => string | null
  /** Whether someone sits at the board in an open lobby: the lobby scene shows only then, otherwise it's off. */
  inLobby: (boardId: string) => Promise<boolean>
  /** Runs `fn` after `ms` (setTimeout in production, a manual clock in tests). */
  later: (ms: number, fn: () => void) => void
  warn: (msg: string, details?: unknown) => void
}

/** What a fire came to: sent to the strips, nothing to show for it, or no way to send. */
type Fired = 'sent' | 'no-rule' | 'unavailable'

type SessionLike = { boardId: string | null; seats: { boardId: string | null }[] }
/** The scene last shown on a board, remembered so a reconnect or a takeout can bring it back. */
type RememberedScene = { t: BoardTrigger; game: GameId | null; layout: SeatLayout }

/** Statuses that end Calibrating without the calibration having finished. */
const NOT_CALIBRATED = new Set(['Offline', 'Stopping', 'Stopped'])

const toLightDevice = (d: WledDeviceRow): LightDevice => ({ leds: d.leds, segmentMode: d.segment_mode, segments: d.segments })

const boardsOf = (s: SessionLike): string[] => [
  ...new Set([s.boardId, ...s.seats.map(x => x.boardId)].filter((b): b is string => b !== null)),
]

const isLocal = (s: SessionLike, seat: number, board: string): boolean => (s.seats[seat]?.boardId ?? s.boardId) === board

const isTurn = (t: Trigger): t is Trigger & { kind: 'turn'; seat: number } => t.kind === 'turn'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** The `status` of a board.status event (BoardStatusData, schema/adbridge-v1.json), or null for anything malformed. */
function statusOf(data: unknown): string | null {
  if (!isRecord(data)) return null
  const status = data.status
  return typeof status === 'string' ? status : null
}

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
    case 'cricket':
      return snap.game.marks.length
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
    case 'lobby':
    case 'takeout.started':
    case 'takeout.finished':
    case 'calibration.finished':
      return { kind }
    case 'visit':
      return { kind, seat: 0, total: 180 }
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
  /** Boards the Board Manager currently reports as "Calibrating" (board.status). Their lights are
   *  left alone (a light change can disturb the calibration); leaving the status plays the
   *  Calibrated flash and restores the scene. */
  private calibrating = new Set<string>()
  /** The scene restore still due after a board's Calibrated flash; a newer calibration replaces it. */
  private pendingRestore = new Map<string, symbol>()
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

  /** Boards go idle (after the win flash), or off when no lobby uses them. */
  async onGameEnded(sessionId: string): Promise<void> {
    const session = this.deps.getSession(sessionId)
    if (!session) return
    await Promise.all(
      boardsOf(session).map(board =>
        this.enqueue(board, async () => {
          this.scene.delete(board)
          await this.idle(board)
        }),
      ),
    )
  }

  /** Boards were picked in or dropped from a lobby (or its lobby closed): with no game on them,
   *  they go idle or off to match. */
  async onLobbyBoards(boardIds: string[]): Promise<void> {
    await Promise.all(
      boardIds.filter(b => this.deps.sessionOnBoard(b) === null && !this.calibrating.has(b)).map(b => this.enqueue(b, () => this.idle(b))),
    )
  }

  onForgotten(sessionId: string): void {
    this.last.delete(sessionId)
  }

  async onBoardEvent(boardId: string, kind: string, data?: unknown): Promise<void> {
    if (kind === 'takeout.started') {
      return this.enqueue(boardId, () => this.fire(boardId, { kind: 'takeout.started', local: true }, null, { seatCount: 1 }))
    }
    if (kind === 'takeout.finished') {
      // Still calibrating (a takeout mid-calibration, however unlikely): don't restore yet,
      // calibration.finished does it when the Board Manager actually leaves Calibrating.
      if (this.calibrating.has(boardId)) return
      return this.enqueue(boardId, () => this.resendOrIdle(boardId))
    }
    if (kind === 'board.status') {
      const status = statusOf(data)
      if (status === null) return
      const wasCalibrating = this.calibrating.has(boardId)
      if (status === 'Calibrating' && !wasCalibrating) {
        this.calibrating.add(boardId)
        this.pendingRestore.delete(boardId)
        return
      }
      if (status !== 'Calibrating' && wasCalibrating) {
        this.calibrating.delete(boardId)
        // The board going away is no finished calibration: just bring the scene back
        if (NOT_CALIBRATED.has(status)) return this.enqueue(boardId, () => this.resendOrIdle(boardId))
        return this.enqueue(boardId, () => this.calibrated(boardId))
      }
    }
  }

  /** The bridge said hello: same as a devices change (devices.ts calls this instead for an API
   *  change that doesn't involve a fresh connection) — darkens a strip left on while lights are
   *  off, otherwise sends the devices and the current scene. */
  async onBridgeHello(boardId: string): Promise<void> {
    // The status is unknown again; the bridge reports Calibrating afresh if it still is
    this.calibrating.delete(boardId)
    return this.devicesChanged(boardId)
  }

  /** Lights off: darkens every device and clears the bridge's allowlist. Otherwise sends the
   *  devices, then the current scene. */
  async devicesChanged(boardId: string): Promise<void> {
    return this.enqueue(boardId, async () => {
      if (!(await this.deps.enabled(boardId))) {
        await this.darken(boardId)
        return
      }
      await this.sendDevicesAndScene(boardId)
    })
  }

  /** Darkens one device directly (a DELETE): sent before devicesChanged's new allowlist, since
   *  once it's out of the allowlist a pending off would never reach it otherwise. Nothing for an
   *  unsupported bridge, like every other send. */
  async darkenDevice(boardId: string, deviceId: string): Promise<void> {
    return this.enqueue(boardId, () => {
      if (!supportsLights(this.deps.bridgeVersion(boardId))) return Promise.resolve()
      try {
        this.deps.send(boardId, { kind: 'wled.apply', data: { device_id: deviceId, state: { on: false } } })
      } catch (err) {
        this.deps.warn('lights darken device failed', err)
      }
      return Promise.resolve()
    })
  }

  /** Plays a profile rule for the API's Test button. False: no such rule, an unsupported/offline bridge, or nothing could be sent. */
  async test(boardId: string, ruleIndex: number): Promise<boolean> {
    if (!supportsLights(this.deps.bridgeVersion(boardId))) return false
    let devices: WledDeviceRow[]
    let profile: Profile
    try {
      devices = await this.deps.devices(boardId)
      profile = await this.deps.profile(boardId)
    } catch (err) {
      this.deps.warn('lights test failed', err)
      return false
    }
    const rule = profile.rules.at(ruleIndex)
    if (!rule || devices.length === 0) return false
    const t: BoardTrigger = { ...sampleTrigger(rule.when.trigger), local: true }
    for (const device of devices)
      this.send(boardId, device, rule, t, { seatCount: 1 }, profile.seatColors, rule.type === 'flash' ? rule.holdMs : 3000)
    return true
  }

  /** Chains `task` on `board`'s queue: it runs after every earlier call for this board has settled,
   *  in the order they were enqueued (not the order their internal awaits happen to resolve), and
   *  the queue itself never rejects (a failing task is warned and the chain moves on). */
  private enqueue(board: string, task: () => Promise<unknown>): Promise<void> {
    const chain = (this.queues.get(board) ?? Promise.resolve())
      .then(task)
      .then(() => undefined)
      .catch((err: unknown) => {
        this.deps.warn('lights queue failed', err)
      })
    this.queues.set(board, chain)
    return chain
  }

  /** Calibration finished: the Calibrated flash plays once, then the remembered scene comes back
   *  once the flash is over. */
  private async calibrated(boardId: string): Promise<void> {
    const t: BoardTrigger = { kind: 'calibration.finished', local: true }
    if ((await this.fire(boardId, t, null, { seatCount: 1 })) !== 'sent') return this.resendOrIdle(boardId)
    const token = Symbol()
    this.pendingRestore.set(boardId, token)
    const rule = match(await this.deps.profile(boardId), t, null)
    this.deps.later(rule?.holdMs ?? CALIBRATED_HOLD_MS, () => {
      void this.enqueue(boardId, async () => {
        // A newer calibration owns the lights now
        if (this.pendingRestore.get(boardId) !== token) return
        this.pendingRestore.delete(boardId)
        if (!this.calibrating.has(boardId)) await this.resendOrIdle(boardId)
      })
    })
  }

  private async resendOrIdle(boardId: string): Promise<void> {
    if (!(await this.resendScene(boardId))) await this.idle(boardId)
  }

  /** Shows the scene remembered for the board again. False if there is none. If its effect has been switched off since, it is
   *  forgotten and the strip goes dark instead of keeping a scene the player turned off; any other failure (lights off, an old
   *  bridge, no devices, an error) leaves the strip and the scene as they were. */
  private async resendScene(boardId: string): Promise<boolean> {
    const remembered = this.scene.get(boardId)
    if (!remembered) return false
    if ((await this.fire(boardId, remembered.t, remembered.game, remembered.layout)) === 'no-rule') {
      this.scene.delete(boardId)
      await this.turnOff(boardId)
    }
    return true
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
    if (await this.resendScene(boardId)) return
    const sessionId = this.deps.sessionOnBoard(boardId)
    const session = sessionId ? this.deps.getSession(sessionId) : undefined
    const snapshot = sessionId ? this.deps.getSnapshot(sessionId) : undefined
    const turn = snapshot ? triggersFor(null, snapshot).find(isTurn) : undefined
    if (session && snapshot && turn) {
      const layout = layoutFor(session, snapshot)
      if ((await this.fire(boardId, { ...turn, local: isLocal(session, turn.seat, boardId) }, snapshot.gameId, layout)) !== 'no-rule')
        return
    }
    await this.idle(boardId)
  }

  /** No game on the board: the lobby scene while a lobby uses it and its rule is on (it is off by
   *  default), otherwise off. Never remembered, so a reconnect or takeout asks the lobby again. */
  private async idle(boardId: string): Promise<void> {
    if (this.calibrating.has(boardId)) return
    try {
      const inLobby = await this.deps.inLobby(boardId)
      if (!inLobby || (await this.fire(boardId, { kind: 'lobby', local: true }, null, { seatCount: 1 })) !== 'sent')
        await this.turnOff(boardId)
    } catch (err) {
      this.deps.warn('lights idle failed', err)
    }
    this.scene.delete(boardId)
  }

  /** Every device off, keeping the bridge's allowlist (unlike darken). */
  private async turnOff(boardId: string): Promise<void> {
    if (this.calibrating.has(boardId)) return
    if (!(await this.deps.enabled(boardId))) return
    if (!supportsLights(this.deps.bridgeVersion(boardId))) return
    for (const d of await this.deps.devices(boardId))
      this.deps.send(boardId, { kind: 'wled.apply', data: { device_id: d.id, state: { on: false } } })
  }

  /** Lights off: darken every device, then clear the bridge's allowlist. Nothing for an
   *  unsupported bridge, like every other send. The devices list goes out first, before any off:
   *  a bridge that just (re)connected has no workers yet, and an apply for a device the bridge
   *  doesn't know about is dropped as unpaired rather than queued. */
  private async darken(boardId: string): Promise<void> {
    if (!supportsLights(this.deps.bridgeVersion(boardId))) return
    try {
      const devices = await this.deps.devices(boardId)
      this.deps.send(boardId, {
        kind: 'wled.devices',
        data: { devices: devices.map(d => ({ id: d.id, mac: d.mac, host: d.host, max_bri: d.max_bri })) },
      })
      for (const d of devices) this.deps.send(boardId, { kind: 'wled.apply', data: { device_id: d.id, state: { on: false } } })
      this.deps.send(boardId, { kind: 'wled.devices', data: { devices: [] } })
    } catch (err) {
      this.deps.warn('lights darken failed', err)
    }
  }

  /** Lights off, an unsupported/offline bridge, no devices or an error: nothing to send ('unavailable'). Otherwise sends the
   *  matching rule to every device ('sent'), or 'no-rule' when the board's profile has none for the trigger (its effect is
   *  switched off, or it has none). */
  private async fire(board: string, t: BoardTrigger, game: GameId | null, layout: SeatLayout): Promise<Fired> {
    try {
      if (!(await this.deps.enabled(board))) return 'unavailable'
      if (!supportsLights(this.deps.bridgeVersion(board))) return 'unavailable'
      const devices = await this.deps.devices(board)
      if (devices.length === 0) return 'unavailable'
      const profile = await this.deps.profile(board)
      const rule = match(profile, t, game)
      if (!rule) return 'no-rule'
      const remember = rule.type === 'scene' && t.kind !== 'takeout.started'
      if (this.calibrating.has(board)) {
        // Calibrating: leave the lights as they are, a scene change is only remembered
        if (remember) this.scene.set(board, { t, game, layout })
        return 'unavailable'
      }
      for (const device of devices)
        this.send(board, device, rule, t, layout, profile.seatColors, rule.type === 'flash' ? rule.holdMs : undefined)
      if (remember) this.scene.set(board, { t, game, layout })
      return 'sent'
    } catch (err) {
      this.deps.warn('lights fire failed', err)
      return 'unavailable'
    }
  }

  /** Sends one device's wled.apply; a thrown error is logged, never raised into the engine path. */
  private send(
    board: string,
    device: WledDeviceRow,
    rule: Rule,
    t: BoardTrigger,
    layout: SeatLayout,
    seatColors: readonly string[],
    holdMs: number | undefined,
  ): void {
    try {
      this.deps.send(board, {
        kind: 'wled.apply',
        data: { device_id: device.id, state: patchFor(rule, t, toLightDevice(device), layout, seatColors), hold_ms: holdMs },
      })
    } catch (err) {
      this.deps.warn('lights send failed', err)
    }
  }
}
