import { describe, it, expect } from 'vitest'
import pino from 'pino'
import { logOptions } from './log.js'

describe('logOptions', () => {
  it('keeps the message of an Error passed as details, and plain details as they are', () => {
    const lines: string[] = []
    const l = pino({ ...logOptions, level: 'info' }, { write: (line: string) => lines.push(line) })
    l.warn({ details: new Error('boom') }, 'x')
    l.warn({ details: { boardId: 'b' } }, 'y')
    expect(JSON.parse(lines[0]).details.message).toBe('boom')
    expect(JSON.parse(lines[1]).details).toEqual({ boardId: 'b' })
  })
})
