import { ApiError } from '../api/errors.js'

export type FriendConflictCode = 'already_friends' | 'already_requested'

/** A refused friends operation; the REST layer answers with its status and body (FriendConflict for 409). */
export class FriendError extends ApiError {
  private constructor(status: 400 | 404 | 409, body: { error: string; code?: FriendConflictCode }) {
    super(status, body)
  }
  static badRequest(error: string): FriendError {
    return new FriendError(400, { error })
  }
  static notFound(error: string): FriendError {
    return new FriendError(404, { error })
  }
  static conflict(error: string, code: FriendConflictCode): FriendError {
    return new FriendError(409, { error, code })
  }
}
