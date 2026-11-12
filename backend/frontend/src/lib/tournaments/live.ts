// The live tournament page (Tournament-Live): the /ws/tournament socket, and what the page shows
// from its message: the bracket's sections and columns, your match, which matches you may watch,
// the headline, the schedule and the rules.
import { writable, type Readable } from 'svelte/store'
import type { Tournament } from '$lib/api'
import { WsCloseCode } from '$lib/api/game-ws.js'
import type { TournamentLiveEntry, TournamentLiveMatch, TournamentLiveMessage, TournamentLiveStage } from '$lib/api/tournament-ws.js'
import { TournamentLiveMessageSchema } from '$lib/api/zod.js'
import type { Face } from '$lib/face'
import { LOCALE } from '$lib/fmt'
import { reconnectingSocket, type OpenSocket } from '$lib/reconnectingSocket.js'
import { roundsOf, stageName } from '$shared/tournaments/schedule'

export type LiveMessage = TournamentLiveMessage
export type LiveMatch = TournamentLiveMatch
export type LiveEntry = TournamentLiveEntry

/** The socket's latest message; `gone` once the server says the tournament is not there for us. */
export function createLiveStore(
  tournamentId: string,
  code: string | undefined,
  open?: OpenSocket,
): { message: Readable<LiveMessage | null>; gone: Readable<boolean>; destroy(): void } {
  const message = writable<LiveMessage | null>(null)
  const gone = writable(false)
  const query = new URLSearchParams({ tournamentId, ...(code && { code }) })
  const socket = reconnectingSocket(
    `/ws/tournament?${query}`,
    {
      onMessage: data => {
        const m = TournamentLiveMessageSchema.safeParse(data)
        if (m.success) message.set(m.data)
      },
      onClose: code => {
        const name: string | undefined = WsCloseCode[code]
        if (name === 'NotFound' || name === 'Forbidden' || name === 'Unauthorized') {
          gone.set(true)
          return 'stop'
        }
        return undefined
      },
    },
    open,
  )
  return { message, gone, destroy: () => socket.stop() }
}

/** The entry `userId` plays for (withdrawn ones too), or null. */
export const myEntryId = (m: LiveMessage, userId: string | undefined): string | null =>
  (userId && m.entries.find(e => e.players.some(p => p.userId === userId))?.id) || null

/** Whose picture an entry shows: its first player's (a team's captain). */
export function faceOf(e: LiveEntry | null | undefined): Face | null {
  const p = e?.players.at(0)
  return p ? { avatar: p.avatar, userId: p.userId } : null
}

/** Watch: a game being played that you are not in. */
export const canWatch = (match: LiveMatch, mine: string | null): boolean =>
  match.game !== null && (mine === null || !match.sides.includes(mine))

export interface Column {
  readonly name: string
  readonly matches: LiveMatch[]
}
export interface Section {
  readonly id: 'main' | 'lower' | 'final'
  /** Shown above the columns when the bracket has more than one section. */
  readonly title: string
  readonly columns: Column[]
}

/** The knockout as columns per round: the main bracket, then a double elimination's lower bracket and grand final. */
export function sectionsOf(m: LiveMessage, format: Tournament['format']): Section[] {
  const main = { double_elimination: 'Upper bracket', round_robin: 'Matches', groups_knockout: 'Knockout', single_elimination: 'Bracket' }[
    format
  ]
  const titles = { main, lower: 'Lower bracket', final: 'Grand final' }
  return (['main', 'lower', 'final'] as const).flatMap(bracket => {
    const ms = m.matches.filter(x => x.bracket === bracket)
    if (ms.length === 0) return []
    const rounds = roundsOf(m.matches, bracket)
    const columns = Array.from({ length: rounds }, (_, i) => ({
      name: stageName(format, { bracket, round: i + 1 }, rounds),
      matches: ms.filter(x => x.round === i + 1).sort((a, b) => a.index - b.index),
    }))
    return [{ id: bracket, title: titles[bracket], columns }]
  })
}

/** A group's matches, round by round. */
export const groupMatches = (m: LiveMessage, group: number): LiveMatch[] =>
  m.matches.filter(x => x.bracket === 'group' && x.group === group).sort((a, b) => a.round - b.round || a.index - b.index)

/** A match's stage in the singular: "Quarter-final", "Round 2", "Grand final". */
export function stageOf(m: LiveMessage, format: Tournament['format'], match: LiveMatch): string {
  if (match.bracket === 'group') return `Group ${match.group ?? ''}`
  const name = stageName(format, match, roundsOf(m.matches, match.bracket))
  return name.replace(/-finals$/, '-final')
}

export interface YourMatch {
  readonly match: LiveMatch
  /** Your side: 0 or 1. */
  readonly side: 0 | 1
  readonly stage: string
  readonly opponent: LiveEntry | null
}

/** Your match that is on (being played) or up next (ready, waiting for both of you). */
export function yourMatch(m: LiveMessage, format: Tournament['format'], userId: string | undefined): YourMatch | null {
  const mine = myEntryId(m, userId)
  const match = mine && m.matches.find(x => (x.status === 'live' || x.status === 'ready') && x.sides.includes(mine))
  if (!match) return null
  const side = match.sides[0] === mine ? 0 : 1
  return { match, side, stage: stageOf(m, format, match), opponent: m.entries.find(e => e.id === match.sides[1 - side]) ?? null }
}

/** The banner's line: "Leg 4 · you 1 – 2 Max · Max is throwing". */
export function yourMatchLine(y: YourMatch): string {
  const name = y.opponent?.name ?? 'your opponent'
  if (y.match.game === null) return `Starts once you and ${name} are both online and free`
  const [mineLegs, theirs] = [y.match.legs[y.side], y.match.legs[1 - y.side]]
  const throwing = y.match.game.throwing === null ? null : y.match.game.throwing === y.side ? "you're throwing" : `${name} is throwing`
  return [`Leg ${mineLegs + theirs + 1}`, `you ${mineLegs} – ${theirs} ${name}`, ...(throwing ? [throwing] : [])].join(' · ')
}

/** The pill over the title: "LIVE · QUARTER-FINALS", "CHECK-IN", "FINISHED". */
export function headline(m: LiveMessage): { text: string; live: boolean } {
  switch (m.status) {
    case 'running': {
      const now = m.schedule.find(s => s.state === 'now') ?? m.schedule.find(s => s.state !== 'done')
      return { text: now ? `Live · ${now.name}` : 'Live', live: true }
    }
    case 'check_in':
      return { text: 'Check-in', live: false }
    case 'finished':
      return { text: 'Finished', live: false }
    case 'cancelled':
      return { text: 'Cancelled', live: false }
    default:
      return { text: 'Registration', live: false }
  }
}

/** A schedule row's time: "now", "done", "≈ 21:10", "≈ Sat 21:10" on another day. */
export function stageWhen(s: TournamentLiveStage, now: Date = new Date()): string {
  if (s.state === 'now') return 'now'
  if (s.state === 'done' || s.at === null) return 'done'
  const at = new Date(s.at)
  const time = at.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
  return at.toDateString() === now.toDateString() ? `≈ ${time}` : `≈ ${at.toLocaleDateString(LOCALE, { weekday: 'short' })} ${time}`
}

/** The tournament's rules as the organizer set them. */
export function rulesOf(t: Pick<Tournament, 'access' | 'settings'>): string[] {
  const s = t.settings
  const online = t.access !== 'in_person'
  const final = s.longerFinal
    ? [`The final is first to ${s.longerFinal.firstTo}${s.longerFinal.semis ? ', and so are the semi-finals' : ''}.`]
    : []
  const play = online
    ? [
        'Next round starts as soon as both players are ready.',
        s.noShowMinutes === null
          ? 'No forfeits: a match waits until both players are there.'
          : `No-show for ${s.noShowMinutes} minutes = forfeit.`,
        ...(s.checkInMinutes !== null
          ? [`Check in during the ${s.checkInMinutes} minutes before the start, or you're left out of the draw.`]
          : []),
        s.manualScoring ? 'Scores may be typed in without a paired board.' : 'Every player plays on their own paired board.',
      ]
    : []
  return [
    `Every match is first to ${s.firstTo} ${s.firstTo === 1 ? 'leg' : 'legs'}.`,
    ...final,
    ...play,
    'Withdrawing once it runs forfeits your remaining matches.',
  ]
}

/** Wins and losses of an entry so far (byes left out). */
export function recordOf(m: LiveMessage, entryId: string): { won: number; lost: number } {
  const decided = m.matches.filter(x => x.status === 'finished' && x.outcome !== 'bye' && x.winner !== null && x.sides.includes(entryId))
  const won = decided.filter(x => x.sides[x.winner ?? 0] === entryId).length
  return { won, lost: decided.length - won }
}

/** The champion once the tournament finished. */
export const championOf = (m: LiveMessage): LiveEntry | null =>
  m.status === 'finished' ? (m.entries.find(e => e.finalPlace === 1) ?? null) : null
