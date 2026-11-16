import { describe, expect, it } from 'vitest'
import { deviceSeen, formatPairCode, pairLink } from './devices'

const now = new Date('2026-11-16T12:00:00Z')

describe('venue device words', () => {
  it('groups a code and builds the link from the origin', () => {
    expect(formatPairCode('ABCDEFGH')).toBe('ABCD EFGH')
    expect(pairLink('https://dartcade.test', 'ABCDEFGH')).toBe('https://dartcade.test/#/tournament-mode/pair/ABCDEFGH')
  })

  it('says when a device was last seen', () => {
    expect(deviceSeen({ paired: false, lastSeenAt: null }, now)).toMatch(/Waiting/)
    expect(deviceSeen({ paired: true, lastSeenAt: null }, now)).toBe('Never seen')
    expect(deviceSeen({ paired: true, lastSeenAt: '2026-11-16T11:59:40Z' }, now)).toBe('Last seen just now')
    expect(deviceSeen({ paired: true, lastSeenAt: '2026-11-16T11:55:00Z' }, now)).toBe('Last seen 5 min ago')
    expect(deviceSeen({ paired: true, lastSeenAt: '2026-11-16T09:00:00Z' }, now)).toBe('Last seen 3 h ago')
    expect(deviceSeen({ paired: true, lastSeenAt: '2026-11-14T12:00:00Z' }, now)).toBe('Last seen 2 d ago')
  })
})
