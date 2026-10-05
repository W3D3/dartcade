import { ApiError } from './errors.js'
import { ActiveSessionError, BoardBusyError, InvalidConfigError, UnknownGameError } from '../session/errors.js'

/**
 * The answer to an error the engine throws when it refuses to start a game (session/errors.ts);
 * any other error is returned as it is. Throw the result.
 */
export function engineApiError(err: unknown): unknown {
  // One running game per user: point the client at the one they have
  if (err instanceof ActiveSessionError) return new ApiError(409, { error: 'You already have a game running', sessionId: err.sessionId })
  if (err instanceof BoardBusyError) return new ApiError(409, { error: err.message })
  if (err instanceof UnknownGameError || err instanceof InvalidConfigError) return new ApiError(400, { error: err.message })
  return err
}
