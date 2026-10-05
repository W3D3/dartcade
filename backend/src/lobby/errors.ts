import { ApiError } from '../api/errors.js'

export type ConflictCode =
  'in_lobby' | 'not_ready' | 'board_offline' | 'board_busy' | 'active_session' | 'game_running' | 'already_member' | 'already_invited'

/** A lobby error's body (LobbyConflict in schema/api-v1.yaml); only 409s carry more than `error`. */
export type LobbyErrorBody = {
  error: string
  code?: ConflictCode
  lobbyId?: string
  sessionId?: string
  notReady?: { personId: string; name: string }[]
  offlineBoards?: string[]
}

/** A refused lobby operation; the REST layer answers with its status and body. */
export class LobbyError extends ApiError {
  // Read back as err.statusCode and err.body (ApiError)
  private constructor(status: 400 | 403 | 404 | 409, body: LobbyErrorBody) {
    super(status, body)
  }
  static badRequest(error: string): LobbyError {
    return new LobbyError(400, { error })
  }
  static forbidden(error: string): LobbyError {
    return new LobbyError(403, { error })
  }
  static notFound(error: string): LobbyError {
    return new LobbyError(404, { error })
  }
  static conflict(body: LobbyErrorBody & { code: ConflictCode }): LobbyError {
    return new LobbyError(409, body)
  }
}

/** The user is in another lobby: they leave it first. */
export const inLobby = (lobbyId: string): LobbyError =>
  LobbyError.conflict({ error: 'leave your current lobby first', code: 'in_lobby', lobbyId })
