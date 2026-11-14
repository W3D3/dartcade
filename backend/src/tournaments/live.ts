// The live tournament page's state (schema/tournament-ws-v1.json): the entries, the bracket's
// matches with the live games' legs, the tables and the schedule, pushed on /ws/tournament; and,
// to organizers, the venue devices in tournament mode.
import type { Kysely } from 'kysely'
import type { WebSocket } from 'ws'
import type { Database } from '../db/schema.js'
import type { TournamentRow } from '../db/tournaments.js'
import { getTournamentRow, latestGame, legsWon, listEntries, listMatches, sideOfSeat } from '../db/tournamentRun.js'
import { getAvatars } from '../db/users.js'
import { currentSeat } from '../session/access.js'
import type { SessionEngine } from '../session/engine.js'
import type { Session } from '../session/types.js'
import type {
  TournamentClientMessage,
  TournamentDevice,
  TournamentDevicesMessage,
  TournamentLiveMatch,
  TournamentLiveMessage,
  TournamentLiveTable,
} from '../schema/tournament-ws.js'
import { snakeGroups, standings, type Match } from '../shared/tournaments/bracket.js'
import { samePlace } from '../shared/tournaments/run.js'
import { schedule, type MatchTimes } from '../shared/tournaments/schedule.js'
import { isOpen } from '../util/socket.js'
import { bracketOf, placeOf, seededOf } from './bracketRows.js'

/** How often every watched tournament is rebuilt; only a changed state is sent. */
const REFRESH_MS = 3_000

type Engine = Pick<SessionEngine, 'getSession'>

/** Legs each side has won so far, from the game's own summary (X01 and Cricket count them; a team's seats share them). */
function liveLegs(session: Session): [number, number] {
  const seats = session.module.summarize(session.currentState, { totalDarts: session.totalDarts, totalVisits: session.totalVisits })
  const legs = seats.map(s => legsWon(s.stats))
  return [legs.at(0) ?? 0, legs.at(-1) ?? 0]
}

/** Each side's running score in the leg (X01's points left, Cricket's points; a team's seats share it), none in a bull off. */
function liveScore(session: Session): [number, number] | null {
  const m = session.module
  if (m.id === 'x01') {
    const v = m.view(session.currentState, session.players)
    return v.phase === 'game' ? [v.scores.at(0) ?? 0, v.scores.at(-1) ?? 0] : null
  }
  if (m.id === 'cricket') {
    const v = m.view(session.currentState, session.players)
    return v.phase === 'game' ? [v.points.at(0) ?? 0, v.points.at(-1) ?? 0] : null
  }
  return null
}

function tablesOf(t: TournamentRow, seeded: string[], bracket: Match[]): TournamentLiveTable[] {
  const rows = (ms: Match[], entries: string[]) => standings(ms, entries).map(({ entry, ...s }) => ({ entryId: entry, ...s }))
  if (t.format === 'round_robin') return [{ group: null, rows: rows(bracket, seeded) }]
  if (t.format !== 'groups_knockout' || !t.settings.groups) return []
  return snakeGroups(seeded, t.settings.groups.size).map((entries, i) => ({
    group: i + 1,
    rows: rows(
      bracket.filter(m => m.group === i + 1),
      entries,
    ),
  }))
}

/** The tournament's live state, or null when it does not exist. */
export async function liveMessage(
  db: Kysely<Database>,
  engine: Engine,
  tournamentId: string,
  now: number,
): Promise<TournamentLiveMessage | null> {
  const t = await getTournamentRow(db, tournamentId)
  if (!t) return null
  const [entries, rows] = await Promise.all([listEntries(db, t.id), listMatches(db, t.id)])
  const avatars = await getAvatars(
    db,
    entries.flatMap(e => e.players.flatMap(p => p.userId ?? [])),
  )
  const seeded = seededOf(entries)
  const bracket = rows.length > 0 ? bracketOf(t, seeded, rows) : []
  // Every stored row is a match of the bracket (the runner drops those it no longer plays)
  const played = bracket.flatMap(m => rows.filter(r => samePlace(m, placeOf(r))).map(r => ({ m, r })))

  const matches = await Promise.all(
    played.map(async ({ m, r }): Promise<TournamentLiveMatch> => {
      const game = r.status === 'live' ? await latestGame(db, r.id) : undefined
      const session = game?.status === 'active' ? engine.getSession(game.id) : undefined
      const winner = r.winner_entry_id === null ? null : r.winner_entry_id === r.entry_a_id ? 0 : 1
      return {
        key: m.key,
        bracket: m.bracket,
        group: m.group,
        round: m.round,
        index: m.index,
        firstTo: r.first_to,
        status: r.status,
        sides: [r.entry_a_id, r.entry_b_id],
        finishedAt: r.finished_at?.toISOString() ?? null,
        outcome: r.outcome,
        winner,
        legs: session ? liveLegs(session) : [r.legs_a, r.legs_b],
        game: session
          ? { sessionId: session.id, throwing: sideOfSeat(currentSeat(session), session.seats.length), score: liveScore(session) }
          : null,
      }
    }),
  )
  const times = new Map<string, MatchTimes>(
    played.map(({ m, r }) => [
      m.key,
      { status: r.status, startedAt: r.started_at?.getTime() ?? null, finishedAt: r.finished_at?.getTime() ?? null },
    ]),
  )
  // The planned start (an organizer start sets it too), not started_at: that is the database's clock, not `now`'s
  const startsAt = t.starts_at?.getTime() ?? now
  return {
    type: 'tournament.live',
    tournamentId: t.id,
    status: t.status,
    entries: entries.map(e => ({
      id: e.id,
      name: e.name,
      status: e.status,
      seed: e.seed,
      finalPlace: e.final_place,
      players: e.players.map(p => ({
        userId: p.userId,
        name: p.name,
        avatar: (p.userId !== null && avatars.get(p.userId)) || { kind: 'none' },
      })),
    })),
    matches,
    tables: tablesOf(t, seeded, bracket),
    schedule: schedule(t.format, bracket, times, startsAt, now).map(s => ({
      bracket: s.bracket,
      round: s.round,
      name: s.name,
      state: s.state,
      at: s.at === null ? null : new Date(s.at).toISOString(),
    })),
  }
}

/** A venue device in tournament mode: an organizer's browser, on its own socket. */
interface Device extends TournamentDevice {
  ws: WebSocket
}

/** Who a socket is: anyone who may see the tournament, an organizer (sees the devices), or a device. */
export type Viewer =
  | { organizer: false }
  /** `device.hold`: the match it played before a reconnect or reload, taken back as it connects. */
  | { organizer: true; device?: { id: string; name: string; hold?: string } }

/** A match a device may take: ready to play, or live (continuing a paused one). */
const playable = (m: TournamentLiveMatch) => m.status === 'ready' || m.status === 'live'

/**
 * The open /ws/tournament sockets per tournament. Each watched tournament is rebuilt every few
 * seconds and sent only when it changed, so the bracket, the live legs and the schedule follow
 * the games without the runner telling anyone. The devices in tournament mode are kept here too
 * (nothing stored: a device is its open socket), and sent to the organizers at once on a change.
 * shortcut: polls the DB per watched tournament, fine at today's handful; hook the runner's changes in if that grows.
 */
export class TournamentLive {
  private readonly sockets = new Map<string, Map<WebSocket, Viewer>>()
  private readonly last = new Map<string, { payload: string; msg: TournamentLiveMessage }>()
  private readonly devices = new Map<string, Device[]>()
  private timer: NodeJS.Timeout | undefined

  constructor(
    private readonly build: (tournamentId: string) => Promise<TournamentLiveMessage | null>,
    private readonly warn: (message: string, details: unknown) => void = () => {},
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      this.refreshAll().catch((err: unknown) => {
        this.warn('tournament live refresh failed', { error: String(err) })
      })
    }, REFRESH_MS)
    this.timer.unref()
  }

  close(): void {
    clearInterval(this.timer)
  }

  socketCount(): number {
    return [...this.sockets.values()].reduce((n, s) => n + s.size, 0)
  }

  /** A socket opened: it gets the state straight away, an organizer the devices too. */
  async add(tournamentId: string, ws: WebSocket, viewer: Viewer = { organizer: false }): Promise<void> {
    const open = this.sockets.get(tournamentId) ?? new Map<WebSocket, Viewer>()
    open.set(ws, viewer)
    this.sockets.set(tournamentId, open)
    // The state first: a device taking its match back is checked against it
    const payload = this.last.get(tournamentId)?.payload ?? (await this.rebuild(tournamentId))
    if (viewer.organizer && viewer.device) {
      const { id, name, hold } = viewer.device
      const list = this.devices.get(tournamentId) ?? []
      // The same browser while its old socket is still open: it takes that place over
      const device = list.find(d => d.id === id) ?? { id, name, matchKey: null, ws }
      Object.assign(device, { ws, name })
      if (!list.includes(device)) list.push(device)
      this.devices.set(tournamentId, list)
      // A reconnect or reload names the match it played: it gets it back unless another device took it
      if (hold !== undefined && this.mayHold(tournamentId, device, hold)) device.matchKey = hold
      this.sendDevices(tournamentId)
    } else if (viewer.organizer) {
      send(ws, this.devicesMessage(tournamentId))
    }
    if (payload !== null && isOpen(ws)) ws.send(payload)
  }

  remove(tournamentId: string, ws: WebSocket): void {
    const open = this.sockets.get(tournamentId)
    open?.delete(ws)
    const list = this.devices.get(tournamentId) ?? []
    // Leaving tournament mode: a match this device played is paused, any device may continue it
    const left = list.filter(d => d.ws !== ws)
    if (left.length !== list.length) {
      this.devices.set(tournamentId, left)
      this.sendDevices(tournamentId)
    }
    if (open?.size === 0) {
      this.sockets.delete(tournamentId)
      this.last.delete(tournamentId)
      this.devices.delete(tournamentId)
    }
  }

  /** What a device sends: its new name, or the match it plays (taken only while nobody else plays it). */
  onMessage(tournamentId: string, ws: WebSocket, msg: TournamentClientMessage): void {
    const list = this.devices.get(tournamentId) ?? []
    const device = list.find(d => d.ws === ws)
    if (!device) return
    if (msg.type === 'device.rename') device.name = msg.name
    else if (msg.matchKey === null) device.matchKey = null
    else if (this.mayHold(tournamentId, device, msg.matchKey)) device.matchKey = msg.matchKey
    else return
    this.sendDevices(tournamentId)
  }

  /** A device may take a match that is ready or live, while no other device plays it. */
  private mayHold(tournamentId: string, device: Device, matchKey: string): boolean {
    const match = this.last.get(tournamentId)?.msg.matches.find(m => m.key === matchKey)
    const taken = (this.devices.get(tournamentId) ?? []).some(d => d !== device && d.matchKey === matchKey)
    return match !== undefined && playable(match) && !taken
  }

  /** Rebuilds the tournament's state and sends it to its sockets if it changed. */
  async refresh(tournamentId: string): Promise<void> {
    const previous = this.last.get(tournamentId)?.payload
    const payload = await this.rebuild(tournamentId)
    if (payload === null || payload === previous) return
    for (const ws of this.sockets.get(tournamentId)?.keys() ?? []) if (isOpen(ws)) ws.send(payload)
    // A device whose match finished is free again
    const matches = this.last.get(tournamentId)?.msg.matches ?? []
    const done = (this.devices.get(tournamentId) ?? []).filter(
      d => d.matchKey !== null && !matches.some(m => m.key === d.matchKey && playable(m)),
    )
    for (const d of done) d.matchKey = null
    if (done.length > 0) this.sendDevices(tournamentId)
  }

  async refreshAll(): Promise<void> {
    for (const id of [...this.sockets.keys()]) await this.refresh(id)
  }

  private devicesMessage(tournamentId: string): TournamentDevicesMessage {
    return {
      type: 'tournament.devices',
      tournamentId,
      devices: (this.devices.get(tournamentId) ?? []).map(({ id, name, matchKey }) => ({ id, name, matchKey })),
    }
  }

  private sendDevices(tournamentId: string): void {
    const msg = this.devicesMessage(tournamentId)
    for (const [ws, viewer] of this.sockets.get(tournamentId) ?? []) if (viewer.organizer) send(ws, msg)
  }

  private async rebuild(tournamentId: string): Promise<string | null> {
    const msg = await this.build(tournamentId)
    if (msg === null) return null
    const payload = JSON.stringify(msg)
    // Only while someone watches: a socket that closed meanwhile leaves nothing behind
    if (this.sockets.has(tournamentId)) this.last.set(tournamentId, { payload, msg })
    return payload
  }
}

function send(ws: WebSocket, msg: TournamentDevicesMessage): void {
  if (isOpen(ws)) ws.send(JSON.stringify(msg))
}
