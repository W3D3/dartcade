import type { Component } from 'svelte'
import ATCPlayerStats from './atc.svelte'
import X01PlayerStats from './x01.svelte'
import type { ATCConfig } from '../../../../src/games/atc.js'

export interface PlayerStatsProps {
  game: Record<string, unknown>
  playerIndex: number
  isActive: boolean
  compact?: boolean
}

export interface GameView {
  title: string
  getBoardHighlights: (game: Record<string, unknown>, playerIndex: number) => number[]
  getPrimaryDisplay: (game: Record<string, unknown>, playerIndex: number) => { label: string; value: string | number }
  getPlayerDisplay: (game: Record<string, unknown>, playerIndex: number) => { remaining: number; dartsLeft: number }
  getSubtitle?: (game: Record<string, unknown>, playerCount?: number) => string
  showVisitScore?: boolean
  PlayerStats?: Component<PlayerStatsProps>
}

const atcView: GameView = {
  title: 'Around the Clock',

  getBoardHighlights: (game, i) => {
    const targets = game.targets as number[] | undefined
    const t = targets?.[i] ?? 0
    if (t >= 1 && t <= 20) return [t]
    if (t === 21) return [25]
    if (t === 22) return [50]
    return []
  },

  getPrimaryDisplay: (game, i) => {
    const targets = game.targets as number[] | undefined
    const t = targets?.[i] ?? 0
    const value = t === 22 ? 'Bull' : t === 21 ? '25' : t > 22 ? '✓' : String(t)
    return { label: 'TARGET', value }
  },

  getPlayerDisplay: (_game, _playerIndex) => ({ remaining: 0, dartsLeft: 3 }),

  getSubtitle: (game, playerCount) => {
    const cfg = game.cfg as ATCConfig | undefined
    const totalVisits = game.totalVisits as number[] | undefined
    const round = totalVisits?.length ? Math.min(...totalVisits) + 1 : 1

    const seqPart = cfg?.order === 'desc' ? '20→1' : cfg?.order === 'random' ? 'Random' : '1–20'
    const seq = game.sequence as number[] | undefined
    const hasBull22 = seq?.includes(22)
    const hasBull21 = seq?.includes(21)
    const bullPart = hasBull22 ? ', then Bull' : hasBull21 ? ', then 25' : ''
    const multPart = cfg?.multiplierAdvances ? 'multiplier advances' : 'any segment counts'
    const playerPart = playerCount && playerCount > 1 ? `${playerCount} players · ` : ''

    return `${playerPart}${seqPart}${bullPart} · ${multPart} · Round ${round}`
  },

  showVisitScore: false,
  PlayerStats: ATCPlayerStats as unknown as Component<PlayerStatsProps>,
}

const x01View: GameView = {
  title: 'X01',

  getBoardHighlights: () => [],

  getPrimaryDisplay: (game, i) => {
    const scores = (game.scores as number[] | undefined) ?? []
    return { label: 'REMAINING', value: scores[i] ?? 0 }
  },

  getPlayerDisplay: (game, i) => {
    const scores = (game.scores as number[] | undefined) ?? []
    const currentPlayer = (game.currentPlayer as number) ?? 0
    const visitDarts = (game.currentVisitDarts as unknown[]) ?? []
    return {
      remaining: scores[i] ?? 0,
      dartsLeft: i === currentPlayer ? 3 - visitDarts.length : 3,
    }
  },

  getSubtitle: (game) => {
    const config = (game.config as any) ?? {}
    const startScore = config.startScore ?? 501
    const outMode = (config.outMode as string | undefined) ?? 'double'
    return `${startScore} · ${outMode} out`
  },

  showVisitScore: true,
  PlayerStats: X01PlayerStats as unknown as Component<PlayerStatsProps>,
}

export const gameViews: Record<string, GameView> = {
  atc: atcView,
  x01: x01View,
}

const fallbackView: GameView = {
  title: 'Game',
  getBoardHighlights: () => [],
  getPrimaryDisplay: (_game, _i) => ({ label: 'SCORE', value: '-' }),
  getPlayerDisplay: (_game, _playerIndex) => ({ remaining: 0, dartsLeft: 3 }),
}

export function getGameView(gameId: string): GameView {
  return gameViews[gameId] ?? fallbackView
}
