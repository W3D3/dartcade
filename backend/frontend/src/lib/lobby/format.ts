// Text for the lobby screens: the join code and link, game summaries, the lobby history.
import type { LobbyActivity, NextGame } from '../api/lobby-ws'

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

const OUT: Record<string, string> = { straight: 'Straight out', double: 'Double out', master: 'Master out' }
const ATC_ORDER: Record<string, string> = { asc: '1–20', desc: '20–1', random: 'Random order' }
const ATC_FINISH: Record<string, string> = { twenty: 'finish on 20', single_bull: 'finish on 25', bull: 'finish on bull' }
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null)

/** One line about the next game's settings: "501 · Double out · First to 2 legs". */
export function nextGameSummary(game: NextGame | null): string {
  if (!game) return ''
  const c = game.config
  if (game.gameId === 'x01') {
    const start = int(c.startScore)
    const legs = int(c.firstTo)
    if (start === null) return ''
    return [String(start), OUT[str(c.outMode)], legs === null ? undefined : `First to ${legs} ${legs === 1 ? 'leg' : 'legs'}`]
      .filter(Boolean).join(' · ')
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
    case 'board_moved': return [actor, t(' moved '), name, t(` to ${a.data.toBoardName ?? 'manual entry'}`)]
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
