import { describe, expect, it } from 'vitest'
import { pickedTarget, shownTier, tierChoices } from './target'

describe('the coach target select', () => {
  it('lists the six tiers with their averages, the suggested one recommended', () => {
    expect(tierChoices('pro').map(c => c.label)).toEqual([
      'Beginner · 30 avg',
      'Pub player · 45 avg',
      'Intermediate · 60 avg',
      'Semi-pro · 75 avg',
      'Pro · 90 avg · Recommended for you',
      'World class · 105 avg',
    ])
  })

  it('shows auto as the suggestion, and stores the suggestion as auto so it follows the average', () => {
    expect(shownTier('auto', 'pub')).toBe('pub')
    expect(shownTier('pro', 'pub')).toBe('pro')
    expect(pickedTarget('pub', 'pub')).toBe('auto')
    expect(pickedTarget('beginner', 'pub')).toBe('beginner')
  })
})
