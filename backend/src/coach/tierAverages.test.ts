import { describe, expect, it } from 'vitest'
import { simulatedAverage } from '../bots/simulatedAverage.js'
import { sigmaForAverage } from '../shared/botLevels.js'
import { COACH_TIERS } from '../shared/coach/tiers.js'

// gen:coach throws each tier's landing table at sigmaForAverage(tier.average). If the bot
// levels are recalibrated or LEVEL_AVERAGE changes, the tiers must still be the averages they say.
describe('coach tiers', () => {
  it.each(COACH_TIERS)('$name throws about a $average average at its sigma', ({ average }) => {
    const got = simulatedAverage(sigmaForAverage(average), 300)
    expect(Math.abs(got - average)).toBeLessThan(4)
  })
})
