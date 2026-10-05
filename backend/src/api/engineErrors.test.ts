import { describe, it, expect } from 'vitest'
import { ApiError } from './errors.js'
import { engineApiError } from './engineErrors.js'
import { ActiveSessionError, BoardBusyError, InvalidConfigError, UnknownGameError } from '../session/errors.js'

const answer = (err: unknown) => {
  const mapped = engineApiError(err)
  return mapped instanceof ApiError ? [mapped.statusCode, mapped.body] : mapped
}

describe('engineApiError', () => {
  it('answers a refused start with its status and body', () => {
    expect(answer(new UnknownGameError('xyz'))).toEqual([400, { error: 'unknown game: xyz' }])
    expect(answer(new InvalidConfigError('bull off needs at least two players'))).toEqual([
      400,
      { error: 'invalid config: bull off needs at least two players' },
    ])
    expect(answer(new BoardBusyError('b1'))).toEqual([409, { error: 'active session already exists for board b1' }])
    expect(answer(new ActiveSessionError('active session already exists for user', 's1', 'u1'))).toEqual([
      409,
      { error: 'You already have a game running', sessionId: 's1' },
    ])
  })

  it('passes any other error on as it is', () => {
    const err = new Error('active session already exists')
    expect(engineApiError(err)).toBe(err)
  })
})
