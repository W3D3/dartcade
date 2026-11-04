// The ranked queue on the lobby card, the tablet rail and the phone strip (MM-Lobby-States
// board): searching (host or member), a match found with its Accept button, accepted and waiting.
import { readable } from 'svelte/store'
import type { Matchmaking } from '$lib/lobby/sockets'
import { acceptedLine, clock, secondsLeft, youAccepted } from './queue'

/** Ticks while something subscribes, for the timers on these cards. */
export const tick = readable(Date.now(), set => {
  const id = setInterval(() => set(Date.now()), 250)
  return () => clearInterval(id)
})

export type QueueView = {
  kind: 'searching' | 'found' | 'accepted'
  /** "SEARCHING · 2V2", "MATCH FOUND", "ACCEPTED · WAITING" (shown in capitals). */
  tag: string
  /** "Ranked duo", "Solo 1v1", "Ranked 2v2". */
  name: string
  /** Under the name: "You started · ±75 RP", "Revealed once all accept". */
  line: string
  /** Counting up while searching ("1:12"), down once found ("0:09"). */
  clock: string
  /** The phone strip's one line: "Searching · Ranked 2v2". */
  strip: string
  /** Who may stop it: the one who searched, else the rest of the duo can only wait. */
  canCancel: boolean
  /** The found match, for Accept and Decline; null while searching. */
  matchId: string | null
  /** Found: the seconds left to accept, for the drain bar. */
  secondsLeft: number
}

/** Null when nothing is searching or found (a paused queue shows nothing here). */
export function queueView(mm: Matchmaking | null, userId: string | null, now: number): QueueView | null {
  const { search, match } = mm ?? {}
  if (match) {
    const left = secondsLeft(match, now)
    const accepted = youAccepted(match)
    const name = `Ranked ${match.mode}`
    return {
      kind: accepted ? 'accepted' : 'found',
      tag: accepted ? 'Accepted · waiting' : 'Match found',
      name,
      line: acceptedLine(match) ?? (match.mode === '2v2' ? 'Revealed once all accept' : 'Revealed once you both accept'),
      clock: `0:${String(left).padStart(2, '0')}`,
      strip: accepted ? `Waiting · ${name}` : 'Match found',
      canCancel: false,
      matchId: match.id,
      secondsLeft: left,
    }
  }
  if (!search) return null
  const duo = search.mode === '2v2'
  const host = search.hostUserId === userId
  return {
    kind: 'searching',
    tag: `Searching · ${search.mode}`,
    name: duo ? 'Ranked duo' : 'Solo 1v1',
    line: `${duo ? (host ? 'You started' : `${search.players[0]} started it`) : 'Ranked'} · ±${search.range} RP`,
    clock: clock((now - Date.parse(search.since)) / 1000),
    strip: `Searching · Ranked ${search.mode}`,
    canCancel: host,
    matchId: null,
    secondsLeft: 0,
  }
}
