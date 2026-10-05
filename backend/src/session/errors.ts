/** Errors SessionEngine throws when it refuses to start a game (api/engineErrors.ts answers them). */

/** No game module has this id. */
export class UnknownGameError extends Error {
  constructor(readonly gameId: string) {
    super(`unknown game: ${gameId}`)
  }
}

/** The game module refused the setup; `reason` says why. */
export class InvalidConfigError extends Error {
  constructor(readonly reason: string) {
    super(`invalid config: ${reason}`)
  }
}

/** Thrown when a player already has a game running; carries that game's id and who it is. */
export class ActiveSessionError extends Error {
  constructor(
    message: string,
    readonly sessionId: string,
    readonly userId: string,
  ) {
    super(message)
  }
}

/** Thrown when a board is in another running game. */
export class BoardBusyError extends Error {
  constructor(readonly boardId: string) {
    super(`active session already exists for board ${boardId}`)
  }
}
