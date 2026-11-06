import { describe, it, expect } from 'vitest'
import { SamplePairing, type PairStill } from './pairing.js'

const jpeg = (label: string) => Buffer.from(label)
const round = (sourceSeq: number, previousSeq: number | null, cams = [0, 1, 2]): PairStill[] =>
  cams.map(cam => ({ cam, sourceSeq, previousSeq, jpeg: jpeg(`${sourceSeq}:${cam}`) }))
const dart = (sourceSeq: number) => ({ sourceSeq, bridgeEventId: `ev${sourceSeq}`, bmVersion: '2.1.0' })

function feed(p: SamplePairing, stills: PairStill[]) {
  return stills.map(s => p.addStill('b1', s)).filter(Boolean)
}

describe('SamplePairing', () => {
  it("pairs a dart with each camera's still after it and the one from the round before", () => {
    const p = new SamplePairing()
    feed(p, round(10, null)) // after the takeout
    expect(p.addDart('b1', dart(14))).toBeNull()
    const [sample] = feed(p, round(14, 10))
    expect(sample).toEqual({
      ...dart(14),
      boardId: 'b1',
      before: [jpeg('10:0'), jpeg('10:1'), jpeg('10:2')],
      after: [jpeg('14:0'), jpeg('14:1'), jpeg('14:2')],
    })
  })

  it('completes when the dart arrives after its stills', () => {
    const p = new SamplePairing()
    feed(p, [...round(10, null), ...round(14, 10)])
    expect(p.addDart('b1', dart(14))?.after).toEqual([jpeg('14:0'), jpeg('14:1'), jpeg('14:2')])
  })

  it("skips a dart whose before still is missing (the bridge coalesced that camera's round)", () => {
    const p = new SamplePairing()
    feed(p, round(10, null, [0, 2])) // camera 1 still busy with an older round
    p.addDart('b1', dart(14))
    expect(feed(p, round(14, 10))).toEqual([])
  })

  it('skips a dart with no previous round (the first still after a reconnect)', () => {
    const p = new SamplePairing()
    p.addDart('b1', dart(14))
    expect(feed(p, round(14, null))).toEqual([])
  })

  it('gives each dart one sample, and its after stills become the next dart’s before', () => {
    const p = new SamplePairing()
    feed(p, round(10, null))
    p.addDart('b1', dart(14))
    expect(feed(p, round(14, 10))).toHaveLength(1)
    expect(feed(p, round(14, 10))).toEqual([]) // a resent round
    p.addDart('b1', dart(18))
    const [second] = feed(p, round(18, 14))
    expect(second?.before).toEqual([jpeg('14:0'), jpeg('14:1'), jpeg('14:2')])
  })

  it('keeps boards apart, and forgets a board on clear', () => {
    const p = new SamplePairing()
    feed(p, round(10, null))
    p.addDart('b2', dart(14))
    expect(feed(p, round(14, 10))).toEqual([])
    p.clear('b1')
    p.addDart('b1', dart(14))
    expect(feed(p, round(14, 10).slice(0, 2))).toEqual([])
  })
})
