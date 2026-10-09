// The meta line next to the game title in the header.
import type { AtcGame, X01Game } from '../api/game-ws'
import { teamsLabel } from '../teams.js'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export type Mode = 'straight' | 'double' | 'master'
export type X01Rules = { startScore: number; inMode: Mode; outMode: Mode; firstTo: number }
export type AtcRules = { order: 'asc' | 'desc' | 'random'; finishOn: 'twenty' | 'single_bull' | 'bull'; multiplierAdvances: boolean }

/** The X01 rules as one line, e.g. "501 · Double out · First to 3 legs"; a team game leads with its teams ("Teams 2v2"). */
export function x01Rules(r: X01Rules, playerCount: number, teams?: string): string {
  const parts: string[] = []
  if (teams) parts.push(teams)
  else if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(String(r.startScore))
  if (r.inMode !== 'straight') parts.push(`${cap(r.inMode)} in`)
  parts.push(`${cap(r.outMode)} out`)
  parts.push(playerCount === 1 ? 'Practice' : `First to ${r.firstTo} ${r.firstTo === 1 ? 'leg' : 'legs'}`)
  return parts.join(' · ')
}

/** The Around the Clock rules as one line, e.g. "1–20, then Bull · any segment counts". */
export function atcRules(r: AtcRules, playerCount: number): string {
  const order = r.order === 'desc' ? '20–1' : r.order === 'random' ? 'Random order' : '1–20'
  const bull = r.finishOn === 'bull' ? ', then Bull' : r.finishOn === 'single_bull' ? ', then 25' : ''
  const parts: string[] = []
  if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(order + bull)
  if (playerCount === 2) parts.push(r.multiplierAdvances ? 'multiplier advances' : 'any segment counts')
  if (playerCount === 1) parts.push('Practice')
  return parts.join(' · ')
}

export function x01Meta(game: X01Game, playerCount: number): string {
  const { legs, firstTo, winner } = game
  // Every seat shows its team's legs: count each team once
  const played = (game.teams?.map(t => t.legs) ?? legs).reduce((a, b) => a + b, 0)
  // After the match: the leg in play when it ended (a won final leg, or one cut short by the round limit)
  const finalLegWon = winner !== null && (legs.at(winner) ?? 0) >= firstTo
  const teams = game.teams ? teamsLabel(game.teams) : undefined
  return `${x01Rules({ ...game.config, firstTo }, playerCount, teams)} · Leg ${finalLegWon ? played : played + 1}`
}

export function atcMeta(game: AtcGame, playerCount: number): string {
  const round = game.totalVisits.length ? Math.min(...game.totalVisits) + 1 : 1
  return `${atcRules(game.cfg, playerCount)} · Round ${round}`
}

/** "1 try per stroke" / "3 tries per stroke". */
const triesLabel = (tries: number) => (tries === 1 ? '1 dart per stroke' : `${tries} tries per stroke`)

/** The Minigolf rules as one line, e.g. "Canal Street · 9 holes · 3 tries per stroke". */
export function minigolfRules(r: { tries: number; ballContact: boolean }, course: string, holes: number, playerCount: number): string {
  const parts: string[] = []
  if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(course, `${holes} ${holes === 1 ? 'hole' : 'holes'}`, triesLabel(r.tries))
  if (r.ballContact) parts.push('ball contact')
  return parts.join(' · ')
}

/** The match header's line: "Canal Street · Hole 4 of 9 · 3 tries per stroke". */
export function minigolfMeta(game: { courseName: string; holeIdx: number; holeCount: number; config: { tries: number } }): string {
  return `${game.courseName} · Hole ${game.holeIdx + 1} of ${game.holeCount} · ${triesLabel(game.config.tries)}`
}
