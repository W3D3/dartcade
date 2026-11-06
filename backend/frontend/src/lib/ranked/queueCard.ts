// The ranked queue on the lobby card, the tablet rail and the phone strip (MM-Lobby-States
// board): searching (host or member), a match found with its Accept button, accepted and waiting.
import type { Matchmaking } from '$lib/lobby/sockets'
import { acceptedLine, clock, secondsLeft, youAccepted } from './queue'

// TODO: flip to true when dartcade-38's matchmaking PR lets either member of a duo
// DELETE /api/matchmaking/search (it answers 403 for the partner until then). Leaving cancels the
// whole duo search; the other member then sees "X left the queue" (matchmaking.ended, reason 'left').
export const MEMBERS_CAN_LEAVE = false

/** Who may stop a search and what the button says: whoever started it cancels (a solo search is its own host); a duo's other member leaves the queue once the server allows it. */
export function stopRule(search: { hostUserId: string }, userId: string | null): { allowed: boolean; label: string } {
  const host = search.hostUserId === userId
  return { allowed: host || MEMBERS_CAN_LEAVE, label: host ? 'Cancel search' : 'Leave queue' }
}

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
  /** Who may stop it: the one who searched, and the rest of the duo once the server allows it. */
  canCancel: boolean
  /** "Cancel search" for the one who searched, "Leave queue" for their partner. */
  cancelLabel: string
  /** The found match, for Accept and Decline; null while searching. */
  matchId: string | null
  /** Found: the seconds left to accept, and of how many in all, for the drain bar. */
  secondsLeft: number
  acceptSeconds: number
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
      clock: clock(left),
      strip: accepted ? `Waiting · ${name}` : 'Match found',
      canCancel: false,
      cancelLabel: '',
      matchId: match.id,
      secondsLeft: left,
      acceptSeconds: match.acceptSeconds,
    }
  }
  if (!search) return null
  const duo = search.mode === '2v2'
  const host = search.hostUserId === userId
  const stop = stopRule(search, userId)
  return {
    kind: 'searching',
    tag: `Searching · ${search.mode}`,
    name: duo ? 'Ranked duo' : 'Solo 1v1',
    line: `${duo ? (host ? 'You started' : `${search.players[0]} started it`) : 'Ranked'} · ±${search.range} RP`,
    clock: clock((now - Date.parse(search.since)) / 1000),
    strip: `Searching · Ranked ${search.mode}`,
    canCancel: stop.allowed,
    cancelLabel: stop.label,
    matchId: null,
    secondsLeft: 0,
    acceptSeconds: 0,
  }
}
