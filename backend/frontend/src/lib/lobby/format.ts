// Text for the lobby screens: the join code and link, game summaries, the lobby history.
import type { LobbyActivity, LobbyPerson, LobbySummary, NextGame } from '../api/lobby-ws'
import { x01Rules, type Mode } from '../gameViews/meta.js'

const GAME_NAMES: Record<string, string> = { x01: 'X01', atc: 'Around the Clock' }

/** The mode's name ("X01", "Around the Clock"); the id itself for a mode we don't know. */
export function gameName(gameId: string): string {
  return GAME_NAMES[gameId] ?? gameId
}

/** K7Q4MD → K7Q4-MD, the way people read it out. */
export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/** Opening it (or scanning its QR code) lands on the Join page with the code filled in. */
export function joinLink(origin: string, code: string): string {
  return `${origin}/#/join/${code}`
}

const ATC_ORDER: Record<string, string> = { asc: '1–20', desc: '20–1', random: 'Random order' }
const ATC_FINISH: Record<string, string> = { twenty: 'finish on 20', single_bull: 'finish on 25', bull: 'finish on bull' }
const BULL_OFF: Record<string, string> = { wdc: 'Bull off (WDC)', pdc: 'Bull off (PDC)' }
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const mode = (v: unknown, fallback: Mode): Mode => (v === 'straight' || v === 'double' || v === 'master' ? v : fallback)

/**
 * One line about the next game's settings: "501 · Double in · Double out · First to 2 legs
 * · Bull off (WDC)" — the same rules line the match screen shows (`x01Rules`), plus bull off
 * when the game's settings turn it on.
 */
export function nextGameSummary(game: NextGame | null): string {
  if (!game) return ''
  const c = game.config
  if (game.gameId === 'x01') {
    const start = int(c.startScore)
    if (start === null) return ''
    const legs = int(c.firstTo) ?? 3
    const rules = x01Rules({ startScore: start, inMode: mode(c.inMode, 'straight'), outMode: mode(c.outMode, 'straight'), firstTo: legs }, 2)
    const bullOff = BULL_OFF[str(c.bullOff)]
    return bullOff ? `${rules} · ${bullOff}` : rules
  }
  if (game.gameId === 'atc') return [ATC_ORDER[str(c.order)], ATC_FINISH[str(c.finishOn)]].filter(Boolean).join(' · ')
  return ''
}

/** A piece of a history line; names are bold. */
export type Part = { text: string; bold?: boolean }

/** A lobby history line, from the viewer's side ("You moved Max to Living room"). */
export function activityLine(a: LobbyActivity, viewerId: string | null): Part[] {
  const you = a.actorUserId !== null && a.actorUserId === viewerId
  const actor: Part = you ? { text: 'You' } : { text: a.actorName ?? 'Someone', bold: true }
  const name: Part = { text: a.data.name ?? 'someone', bold: true }
  const game: Part = { text: gameName(a.data.gameId ?? ''), bold: true }
  const t = (text: string): Part => ({ text })
  switch (a.kind) {
    case 'opened': return [actor, t(' opened the lobby')]
    case 'joined': return you ? [t('You joined')] : [name, t(' joined')]
    case 'left': return you ? [t('You left')] : [name, t(' left')]
    case 'removed': return [actor, t(' removed '), name]
    case 'guest_added': return [actor, t(' added guest '), name]
    case 'board_moved': {
      const to = t(` to ${a.data.toBoardName ?? 'manual entry'}`)
      // The moved person's own id: null for a guest, so they never match the actor
      const movedSelf = a.data.userId !== null && a.data.userId !== undefined && a.data.userId === a.actorUserId
      return movedSelf ? [actor, t(' moved'), to] : [actor, t(' moved '), name, to]
    }
    case 'host_changed': return you ? [t("You're the host now")] : [name, t(' is the host now')]
    case 'game_aborted': return a.actorUserId === null ? [game, t(' was aborted')] : [actor, t(' aborted '), game]
    case 'game_played': {
      const parts: Part[] = [t('Played '), game]
      const n = a.data.players?.length ?? 0
      if (n > 0) parts.push(t(` · ${n} ${n === 1 ? 'player' : 'players'}`))
      if (a.data.winnerName) parts.push(t(' · '), { text: `${a.data.winnerName} won`, bold: true })
      return parts
    }
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** When it happened, as the time of day here: "21:06". */
export function feedTime(at: string): string {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * The lobby indicator (side nav card, phone strip). `line` is the card's full status line;
 * `next` is its last part, for the narrow phone strip.
 */
export type IndicatorView = { tag: string; name: string; line: string; next: string; back: { sessionId: string; label: string } | null }

export function indicatorView(s: LobbySummary): IndicatorView {
  const tag = s.sessionId ? 'In lobby · Playing' : s.youHost ? 'In lobby · Host' : 'In lobby'
  const next = s.sessionId
    ? (s.youThrowNext ? 'you throw next' : 'game running')
    : (s.nextGame ? `Next: ${gameName(s.nextGame.gameId)}` : 'no game picked')
  const first = s.sessionId ? gameName(s.gameId ?? '') : `${s.peopleCount} ${s.peopleCount === 1 ? 'person' : 'people'}`
  const back = s.sessionId
    ? { sessionId: s.sessionId, label: s.leg === null ? 'Back to game' : `Back to game · Leg ${s.leg + 1}` }
    : null
  return { tag, name: s.name, line: `${first} · ${next}`, next, back }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** When an invite came: "just now", "2 min ago", "Today, 18:05", "Yesterday, 18:40", "28 Sep, 09:00". */
export function inviteTime(at: string, now: Date): string {
  const d = new Date(at)
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const time = feedTime(at)
  const days = Math.round((dayStart(now) - dayStart(d)) / 86_400_000)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`
}

/** Under a person's name: whose guest they are, who put them on their board, where they usually play. */
export function personLine(p: LobbyPerson, people: LobbyPerson[], viewerId: string | null): string {
  const nameOf = (userId: string) => (userId === viewerId ? 'you' : people.find(q => q.userId === userId)?.name ?? 'someone')
  const parts: string[] = []
  if (p.userId === null) parts.push(p.addedByUserId === viewerId ? 'Your guest' : `${nameOf(p.addedByUserId)}'s guest`)
  if (p.boardMovedBy !== null) {
    parts.push(`Moved by ${nameOf(p.boardMovedBy)}`)
    if (p.usualBoardName && p.usualBoardName !== p.boardName) parts.push(`usually ${p.usualBoardName}`)
  }
  return parts.join(' · ')
}
