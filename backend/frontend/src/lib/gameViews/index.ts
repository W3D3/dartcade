import type { Component } from 'svelte'
import ATCPlayerStats from './atc.svelte'
import FallbackPlayerStats from './fallback.svelte'

export interface GameView {
  /** Svelte component rendered inside PlayerCard. Props: game, playerIndex, isActive */
  PlayerStats: Component<{ game: Record<string, unknown>; playerIndex: number; isActive: boolean }>
  /** Returns segment numbers (1–20) to highlight on the dartboard. Empty = no dimming. */
  getBoardHighlights: (game: Record<string, unknown>, playerIndex: number) => number[]
}

const atcView: GameView = {
  PlayerStats: ATCPlayerStats as Component<{ game: Record<string, unknown>; playerIndex: number; isActive: boolean }>,
  getBoardHighlights: (game, i) => {
    const targets = game.targets as number[] | undefined
    const t = targets?.[i] ?? 0
    return t >= 1 && t <= 20 ? [t] : []
  },
}

export const gameViews: Record<string, GameView> = {
  atc: atcView,
}

const fallbackView: GameView = {
  PlayerStats: FallbackPlayerStats as Component<{ game: Record<string, unknown>; playerIndex: number; isActive: boolean }>,
  getBoardHighlights: () => [],
}

/** Always returns a view — falls back to debug component for unknown gameIds */
export function getGameView(gameId: string): GameView {
  return gameViews[gameId] ?? fallbackView
}
