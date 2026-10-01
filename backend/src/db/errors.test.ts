import { describe, it, expect } from 'vitest'
import { pgErrorCode } from './errors.js'

describe('pgErrorCode', () => {
  it('reads the Postgres error code of a driver error', () => {
    expect(pgErrorCode(Object.assign(new Error('duplicate key'), { code: '23505' }))).toBe('23505')
  })

  it('is undefined for anything else', () => {
    for (const e of [new Error('x'), null, 'x', { code: 23505 }]) expect(pgErrorCode(e)).toBeUndefined()
  })
})
