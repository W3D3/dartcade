import { describe, expect, it } from 'vitest'
import type { Friend } from '$lib/api/lobby-ws'
import { askedFriends, friendOptions, gameLine, placeText, seatLine } from './view'

const friend = (id: string, online: boolean) =>
  ({ id, name: id, avatar: { kind: 'none' }, status: { kind: online ? 'online' : 'offline' } }) as unknown as Friend
const friends = [friend('mia', false), friend('lena', true), friend('luke', false)]

describe('guest claim view', () => {
  it('names a place and a seat', () => {
    expect(placeText(1)).toBe('1st')
    expect(placeText(null)).toBe('')
    expect(seatLine({ name: 'Pia', placement: 2 })).toBe('Pia · 2nd')
    expect(seatLine({ name: 'Pia', placement: null })).toBe('Pia')
  })

  it('names the game and day', () => {
    expect(gameLine({ mode: 'x01', playedAt: '2026-11-01T18:00:00' })).toBe('X01 · 1 Nov')
  })

  it('offers only friends: online first with nothing typed, name matches otherwise, never the excluded', () => {
    expect(friendOptions(friends, '', []).map(f => f.id)).toEqual(['lena', 'luke', 'mia'])
    expect(friendOptions(friends, 'l', ['lena']).map(f => f.id)).toEqual(['luke'])
    expect(friendOptions(friends, 'zed', [])).toEqual([])
  })

  it('excludes the friends asked for the other seats', () => {
    const seats = [
      {
        seat: 0,
        name: 'Pia',
        placement: 1,
        invite: { id: 'a', user: { id: 'lena', name: 'lena', avatar: { kind: 'none' } }, createdAt: '' },
      },
      { seat: 1, name: 'Tom', placement: 2, invite: null },
    ] as never
    expect(askedFriends(seats, 1)).toEqual(['lena'])
    expect(askedFriends(seats, 0)).toEqual([])
  })
})
