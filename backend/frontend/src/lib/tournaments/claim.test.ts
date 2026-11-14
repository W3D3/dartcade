import { describe, expect, it } from 'vitest'
import { playedRow, unclaimable } from './claim'

const claim = { claimable: true, claimedByMe: false } as Parameters<typeof unclaimable>[0]

describe('claim page', () => {
  it('words each match: result with legs, or up next', () => {
    expect(playedRow({ title: 'Quarter-final', opponent: 'Ben', state: 'won', legs: '3-1' })).toEqual({
      title: 'Quarter-final vs Ben',
      result: 'won 3–1',
      tone: 'won',
    })
    expect(playedRow({ title: 'Group 2', opponent: 'Jule', state: 'lost', legs: '1-3' }).result).toBe('lost 1–3')
    expect(playedRow({ title: 'Grand final', opponent: null, state: 'next', legs: null })).toEqual({
      title: 'Grand final',
      result: 'up next',
      tone: 'next',
    })
  })

  it('says why a spot cannot be claimed, and nothing when it can', () => {
    expect(unclaimable(claim)).toBeNull()
    expect(unclaimable({ ...claim, claimable: false, claimedByMe: true })).toBe('This spot is yours.')
    expect(unclaimable({ ...claim, claimable: false })).toMatch(/can’t be claimed/)
  })
})
