import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import RankBadge from '../components/ranked/RankBadge.svelte'
import {
  fmtRp,
  fmtSeconds,
  ladder,
  playingOn,
  progressBar,
  ratingCard,
  recentRow,
  record,
  signedRp,
  stageThreshold,
  whenPlayed,
  type RankedRating,
} from '../ranked/view'
import { rank } from '$shared/ranked.js'

const rating = (r: Partial<RankedRating>): RankedRating => ({
  mode: '1v1',
  rating: 1200,
  rankIndex: null,
  matches: 0,
  wins: 0,
  streak: 0,
  change30d: 0,
  ...r,
})

describe('ranked view', () => {
  it('writes RP with thin spaces and signs', () => {
    expect(fmtRp(1284)).toBe('1 284')
    expect(fmtRp(950)).toBe('950')
    expect(signedRp(17)).toBe('+17')
    expect(signedRp(-12)).toBe('−12')
    expect(signedRp(0)).toBe('±0')
  })

  it('writes time limits over a minute in whole minutes', () => {
    expect(fmtSeconds(60)).toBe('60 s')
    expect(fmtSeconds(180)).toBe('3 min')
    expect(fmtSeconds(45)).toBe('45 s')
    expect(fmtSeconds(90)).toBe('90 s')
  })

  it('a ranked card: rank, what is missing to the next stage, the 30-day trend', () => {
    const c = ratingCard(rating({ rating: 1284, rankIndex: 14, matches: 40, change30d: 46 }))
    expect(c).toMatchObject({ label: 'Rating · 1v1', rating: '1 284', title: 'Silver V', progress: '· 16 to Gold I', trendUp: true })
    expect(c.trend).toBe('+46 in the last 30 days')
    expect(c.trendShort).toBe('+46 in 30 days')
  })

  it('a card while placing hides the rating', () => {
    expect(ratingCard(rating({ mode: '2v2', rating: null, matches: 2 }))).toMatchObject({
      rating: '2\u2009/\u20095',
      unit: 'placed',
      rank: null,
      title: 'Placement',
      progress: '· rank shown after 5',
      trendShort: 'Rating hidden',
      trendUp: false,
    })
  })

  it('the top rank has nothing left to reach', () => {
    expect(ratingCard(rating({ rating: 2100, rankIndex: 29, matches: 99 })).progress).toBe('· top rank')
  })

  it('the record over both modes, with a streak worth mentioning', () => {
    expect(record([rating({ matches: 30, wins: 18, streak: 3 }), rating({ mode: '2v2', matches: 10, wins: 5, streak: -1 })])).toEqual({
      score: '23–17',
      line: '57% won · 3 wins in a row',
      short: '57% won',
    })
    expect(record([rating({}), rating({ mode: '2v2' })])).toEqual({ score: '0–0', line: 'No ranked matches yet', short: 'None yet' })
  })

  it('when a game was played', () => {
    const now = new Date(2026, 9, 14, 21, 0)
    expect(whenPlayed(new Date(2026, 9, 14, 20, 14), now)).toBe('Today, 20:14')
    expect(whenPlayed(new Date(2026, 9, 13, 20, 14), now)).toBe('Yesterday')
    expect(whenPlayed(new Date(2026, 9, 12, 20, 14), now)).toBe('Mon')
    expect(whenPlayed(new Date(2026, 9, 1, 20, 14), now)).toBe('1 Oct')
  })

  it('a recent duo game names both opponents and their average rating', () => {
    const row = recentRow(
      {
        sessionId: 'g1',
        mode: '2v2',
        won: true,
        change: 14,
        at: new Date(2026, 9, 13, 20).toISOString(),
        score: { mine: 2, theirs: 0 },
        opponents: [
          { userId: 'm', name: 'Marco', rating: 1220, rankIndex: 12, avatar: { kind: 'none' } },
          { userId: 'j', name: 'Jule', rating: 1240, rankIndex: 13, avatar: { kind: 'none' } },
        ],
      },
      new Date(2026, 9, 14, 12),
    )
    expect(row).toEqual({
      key: 'g1',
      won: true,
      name: 'Marco & Jule',
      meta: '2v2 · Yesterday · 1 230 RP',
      change: '+14',
      placement: false,
      opponent: null,
      score: '2–0',
      opponentRank: null,
      day: 'Yesterday',
    })
  })

  it('a placement game hides its RP, and a placing opponent their rating', () => {
    const row = recentRow(
      {
        sessionId: 'g2',
        mode: '1v1',
        won: false,
        change: null,
        at: new Date(2026, 9, 14, 9).toISOString(),
        score: null,
        opponents: [{ userId: 'b', name: 'Ben', rating: null, rankIndex: null, avatar: { kind: 'none' } }],
      },
      new Date(2026, 9, 14, 12),
    )
    expect(row).toEqual({
      key: 'g2',
      won: false,
      name: 'Ben',
      meta: '1v1 · Today, 09:00',
      change: 'Placement',
      placement: true,
      opponent: { userId: 'b', avatar: { kind: 'none' } },
      score: null,
      opponentRank: null,
      day: 'Today',
    })
  })

  it('a 1v1 row shows the legs and the rank the opponent held', () => {
    const row = recentRow(
      {
        sessionId: 'g3',
        mode: '1v1',
        won: true,
        change: 17,
        at: new Date(2026, 9, 14, 9).toISOString(),
        score: { mine: 2, theirs: 1 },
        opponents: [{ userId: 'a', name: 'Anna K.', rating: 1290, rankIndex: 15, avatar: { kind: 'none' } }],
      },
      new Date(2026, 9, 14, 12),
    )
    // Gold I held (stage 15) although the rating of 1 290 is Silver V's: the demotion buffer
    expect(row).toMatchObject({ score: '2–1', opponentRank: { name: 'Gold I' } })
  })

  it('the ladder, Wood to Elite, stage V first', () => {
    const l = ladder()
    expect(l.map(t => t.tier)).toEqual(['Wood', 'Bronze', 'Silver', 'Gold', 'Diamond', 'Elite'])
    expect(l[5].range).toBe(`${fmtRp(1800)}+`)
    expect(l[0].range).toBe(`0 – 799`)
    expect(l[2].stages.map(s => s.name)).toEqual(['Silver V', 'Silver IV', 'Silver III', 'Silver II', 'Silver I'])
  })

  it('plays on the first board that is online, else the first one paired', () => {
    const a = { name: 'Garage', online: false }
    const b = { name: 'Living room', online: true }
    expect(playingOn([a, b])).toBe(b)
    expect(playingOn([a])).toBe(a)
    expect(playingOn([])).toBeNull()
  })

  it('what a stage takes, the last one open-ended', () => {
    const l = ladder()
    expect(stageThreshold(l[0].stages[4])).toBe('Start')
    expect(stageThreshold(l[0].stages[0])).toBe('750 RP')
    expect(stageThreshold(l[5].stages[0])).toBe(`${fmtRp(2000)}+ RP`)
  })

  it('the progress bar between a stage and the next', () => {
    // Silver V starts at 1 250, Gold I at 1 300
    expect(progressBar(14, 1284)).toMatchObject({ percent: 68, from: fmtRp(1250), missing: '16 RP', next: { name: 'Gold I' } })
    // Held a stage above the rating (the demotion buffer): empty, not negative
    expect(progressBar(14, 1240)?.percent).toBe(0)
    expect(progressBar(29, 2100)).toBeNull()
  })
})

describe('RankBadge', () => {
  it('labels the rank and fills a tick per stage', () => {
    const out = render(RankBadge, { props: { rank: rank(16), size: 40 } }).body
    expect(out).toContain('aria-label="Gold II"')
    expect(out).toContain('>II<')
    expect(out.match(/fill-opacity="1"/g)).toHaveLength(2)
    expect(out).toContain('drop-shadow')
  })

  it('a solid badge without ticks when small', () => {
    const out = render(RankBadge, { props: { rank: rank(2), size: 24 } }).body
    expect(out).toContain('aria-label="Wood III"')
    expect(out).not.toContain('<rect')
  })

  it('scales the glow with the size, as the insignia board does', () => {
    const glow = (size: number) => render(RankBadge, { props: { rank: rank(27), size } }).body.match(/drop-shadow\(0 0 (\d+)px/)?.[1]
    expect([glow(96), glow(66), glow(40), glow(24), glow(18)]).toEqual(['15', '10', '6', '4', '3'])
  })

  it('a small Elite badge keeps its gradient and inner ring', () => {
    const out = render(RankBadge, { props: { rank: rank(27), size: 24 } }).body
    expect(out).toContain('stop-color="#e5f9af"')
    expect(out).toContain('stroke="#0f100e"')
    expect(out).not.toContain('<rect')
  })

  it('a dashed question mark while placing', () => {
    const out = render(RankBadge, { props: { rank: null } }).body
    expect(out).toContain('aria-label="Placement"')
    expect(out).toContain('stroke-dasharray')
  })
})
