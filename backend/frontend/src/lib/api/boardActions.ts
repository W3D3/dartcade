import { api } from './client'
import type { BoardStatus } from './index'
import { commandError, polledStatus } from '$lib/boardStatus'

/** Board Manager commands, one spec operation each. */
export const BOARD_ACTION_PATHS = {
  start: '/api/boards/{id}/start',
  stop: '/api/boards/{id}/stop',
  reset: '/api/boards/{id}/reset',
  calibrate: '/api/boards/{id}/calibrate',
} as const
export type BoardAction = keyof typeof BOARD_ACTION_PATHS

/** Runs a Board Manager command: null when it worked, else what to tell the player (commandError). */
export async function runBoardAction(boardId: string, action: BoardAction): Promise<string | null> {
  try {
    const { error, response } = await api.POST(BOARD_ACTION_PATHS[action], { params: { path: { id: boardId } } })
    return error ? commandError(response.status) : null
  } catch {
    return commandError(undefined)
  }
}

/** The board's Board Manager status as its dot shows it (polledStatus); null when nothing is known. */
export async function fetchBoardStatus(boardId: string): Promise<BoardStatus | null> {
  try {
    const { data, response } = await api.GET('/api/boards/{id}/status', { params: { path: { id: boardId } } })
    return polledStatus(data, response.status)
  } catch {
    return null
  }
}
