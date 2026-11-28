import { describe, expect, it } from 'vitest'
import { outcomeText } from './battle'

describe('outcomeText', () => {
  it('says what each outcome does and joins them', () => {
    expect(outcomeText([])).toBe('Nothing happens.')
    expect(
      outcomeText([
        { kind: 'gold', value: 25 },
        { kind: 'hp', value: -8 },
      ]),
    ).toBe('Gain 25 gold. Every hero loses 8 HP.')
    expect(outcomeText([{ kind: 'item', item: 'whetstoneRune' }])).toMatch(/goes on a random number/)
  })
})
