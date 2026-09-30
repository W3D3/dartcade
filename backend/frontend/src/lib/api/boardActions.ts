import { api } from './client'

/** Board Manager commands, one spec operation each. */
export const BOARD_ACTION_PATHS = {
  start: '/api/boards/{id}/start',
  stop: '/api/boards/{id}/stop',
  reset: '/api/boards/{id}/reset',
  calibrate: '/api/boards/{id}/calibrate',
} as const
export type BoardAction = keyof typeof BOARD_ACTION_PATHS

export function runBoardAction(boardId: string, action: BoardAction) {
  return api.POST(BOARD_ACTION_PATHS[action], { params: { path: { id: boardId } } })
}
