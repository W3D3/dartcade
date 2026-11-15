// Tournament mode (Tournament-Mode, #/tournament-mode/:id): a venue device's full-screen view of an
// in-person tournament. The device's name and id, the socket it holds while in tournament mode, and
// what the page shows from the live state: the progress line, the match groups and their lines.
import { get } from 'svelte/store'
import { location } from 'svelte-spa-router'
import type { Tournament } from '$lib/api'
import { LOCALE } from '$lib/fmt'
import { sessionStore } from '$lib/returnTo'
import { deviceStore } from '$lib/storage'
import { roundName } from '$shared/tournaments/bracket'
import { roundsOf } from '$shared/tournaments/schedule'
import { FORMAT_LONG, gamePill } from './browse'
import { createLiveStore, type Device, type LiveMatch, type LiveMessage, type LiveStore } from './live'

const NAME_KEY = 'tournamentMode.deviceName'
const ID_KEY = 'tournamentMode.deviceId'
export const DEVICE_NAME_MAX = 40

/** The name this browser goes by in tournament mode ("Tablet · Bar"), asked on first open (Q15). */
export function deviceName(): string | null {
  try {
    return deviceStore()?.getItem(NAME_KEY) || null
  } catch {
    return null
  }
}

export function rememberDeviceName(name: string): void {
  try {
    deviceStore()?.setItem(NAME_KEY, name)
  } catch {
    // Not remembered: asked again next time
  }
}

/** This tab's id: per tab, so two tabs are two devices, and a reload is the same one again. */
function deviceId(): string {
  const store = sessionStore()
  const id = store?.getItem(ID_KEY) ?? crypto.randomUUID()
  store?.setItem(ID_KEY, id)
  return id
}

export interface ModeSession {
  readonly tournamentId: string
  /** This device's id, as the devices list names it. */
  readonly deviceId: string
  readonly live: LiveStore
  /** The match this device plays, kept to take it again after a reconnect. */
  hold(matchKey: string | null): void
  rename(name: string): void
  /** Leaves tournament mode: the socket closes, a match this device played is paused. */
  close(): void
}

let current: ModeSession | null = null

/**
 * The tournament-mode session of this tab, opened once and kept while the tab shows tournament
 * mode or the game of the match it plays (it lives outside the page so opening that game keeps
 * the device, and its match, in tournament mode). Any other page leaves tournament mode.
 */
export function openMode(tournamentId: string, name: string): ModeSession {
  if (current?.tournamentId === tournamentId) return current
  current?.close()
  let held: string | null = null
  let named = name
  const id = deviceId()
  const live = createLiveStore(tournamentId, {
    // The server forgets a device when its socket drops: each connect gives its name now and the match to take back
    device: { id, name: () => named, hold: () => held },
  })
  const playingSession = () => get(live.message)?.matches.find(m => m.key === held)?.game?.sessionId
  let stopFollowing = () => {}
  const session: ModeSession = {
    tournamentId,
    deviceId: id,
    live,
    hold(matchKey) {
      held = matchKey
      live.send({ type: 'device.hold', matchKey })
    },
    rename(next) {
      named = next
      live.send({ type: 'device.rename', name: next })
    },
    close() {
      stopFollowing()
      live.destroy()
      if (current === session) current = null
    },
  }
  current = session
  stopFollowing = location.subscribe(path => {
    const here = path.startsWith(`/tournament-mode/${tournamentId}`) || path === `/session/${playingSession() ?? ''}`
    if (!here) session.close()
  })
  return session
}

/** "QF 3", "SF 1", "Final", "R2 3", "LR1 2", "GF", "G1 4": a match's short name. */
export function matchLabel(m: LiveMessage, format: Tournament['format'], match: LiveMatch): string {
  const many = m.matches.filter(x => x.bracket === match.bracket && x.round === match.round && x.group === match.group).length > 1
  const n = many ? ` ${match.index}` : ''
  switch (match.bracket) {
    case 'group':
      return `G${match.group ?? ''}${n}`
    case 'lower':
      return `LR${match.round}${n}`
    case 'final':
      return match.round === 1 ? 'GF' : 'GF 2'
    case 'main': {
      if (format === 'round_robin') return `R${match.round}${n}`
      const short = roundName(match.round, roundsOf(m.matches, 'main')).short
      return short === 'Final' ? 'Final' : `${short}${n}`
    }
  }
}

/** The bar's line: "X01 501 · single elimination · 8 players · Quarter-finals: 2 of 4 done". */
export function barLine(t: Pick<Tournament, 'gameId' | 'gameConfig' | 'format' | 'teamSize'>, m: LiveMessage): string {
  const playing = m.entries.filter(e => e.status !== 'withdrawn').length
  return [gamePill(t.gameId, t.gameConfig), FORMAT_LONG[t.format], `${playing} ${t.teamSize === 1 ? 'players' : 'teams'}`, progress(m)]
    .filter(Boolean)
    .join(' · ')
}

function progress(m: LiveMessage): string {
  if (m.status === 'finished') return 'Finished'
  if (m.status !== 'running') return 'Not started'
  const stage = m.schedule.find(s => s.state === 'now') ?? m.schedule.find(s => s.state !== 'done')
  if (!stage) return ''
  const ms = m.matches.filter(x => x.bracket === stage.bracket && x.round === stage.round && x.outcome !== 'bye')
  return `${stage.name}: ${ms.filter(x => x.status === 'finished').length} of ${ms.length} done`
}

/** The matches as the Matches tab groups them. */
export interface MatchGroups {
  readonly ready: LiveMatch[]
  /** The round after: one side, or both, still to be decided. */
  readonly upNext: LiveMatch[]
  readonly playing: LiveMatch[]
  /** Latest first; byes left out. */
  readonly finished: LiveMatch[]
}

export function matchGroups(m: LiveMessage): MatchGroups {
  const pending = m.matches.filter(x => x.status === 'pending')
  // Per bracket, only its next round to come
  const next = new Map<string, number>()
  for (const x of pending) next.set(`${x.bracket}${x.group}`, Math.min(next.get(`${x.bracket}${x.group}`) ?? Infinity, x.round))
  return {
    ready: m.matches.filter(x => x.status === 'ready'),
    upNext: pending.filter(x => next.get(`${x.bracket}${x.group}`) === x.round),
    playing: m.matches.filter(x => x.status === 'live'),
    finished: m.matches
      .filter(x => x.status === 'finished' && x.outcome !== 'bye')
      .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '')),
  }
}

/**
 * The match that decides an empty side of a knockout match: in a bracket whose previous round has
 * twice the matches, side 0 of match i comes from match 2i-1 and side 1 from 2i. Null otherwise
 * (a lower bracket, a grand final, a knockout after groups): the side is just to be decided.
 */
export function feederOf(m: LiveMessage, match: LiveMatch, side: 0 | 1): LiveMatch | null {
  if (match.bracket !== 'main' || match.round === 1) return null
  const prev = m.matches.filter(x => x.bracket === 'main' && x.round === match.round - 1)
  const here = m.matches.filter(x => x.bracket === 'main' && x.round === match.round)
  if (prev.length !== here.length * 2) return null
  return prev.find(x => x.index === match.index * 2 - 1 + side) ?? null
}

/** Who plays a live match, or null while it is paused (no device plays it). */
export const playedOn = (match: LiveMatch, devices: readonly Device[]): Device | null => devices.find(d => d.matchKey === match.key) ?? null

/** A live match's score line: "Leg 4 · Mia K. 132 left · Paul 40 left" (Cricket: points). */
export function scoreLine(match: LiveMatch, names: [string, string], gameId: string): string {
  const leg = `Leg ${match.legs[0] + match.legs[1] + 1}`
  const score = match.game?.score
  if (!score) return leg
  const side = (i: 0 | 1) => `${names[i]} ${score[i]}${gameId === 'x01' ? ' left' : ''}`
  return [leg, side(0), side(1)].join(' · ')
}

/** A device's state on the devices card: "Free", "Playing QF 2". */
export function deviceLine(d: Device, m: LiveMessage | null, format: Tournament['format']): string {
  const match = m?.matches.find(x => x.key === d.matchKey)
  return match && m ? `Playing ${matchLabel(m, format, match)}` : 'Free'
}

/** "19:42". */
export const clock = (iso: string): string => new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
