import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import { ACHIEVEMENTS } from '$shared/achievements.js'
import { badgeOf } from '$lib/achievements/view'
import Badge from '../components/achievements/Badge.svelte'
import AchievementCard from '../components/achievements/AchievementCard.svelte'
import AchievementList from '../components/achievements/AchievementList.svelte'
import ShowcaseBar from '../components/achievements/ShowcaseBar.svelte'

// A plain store instead of the OFREP-backed one: the progression.manualDarts flag
const { manualDarts } = await vi.hoisted(async () => ({ manualDarts: (await import('svelte/store')).writable(false) }))
vi.mock('$lib/flags', () => ({ flag: () => manualDarts }))

const def = ACHIEVEMENTS[0]
const at = (count: number, tier: number) =>
  badgeOf(def, {
    id: def.id,
    count,
    tier,
    tiers: Array.from({ length: tier }, (_, i) => ({
      tier: i + 1,
      reachedAt: '2026-11-03T10:00:00Z',
      where: null,
      gameId: null,
      gone: false,
    })),
    isNew: false,
  })

describe('Badge', () => {
  it('draws the tier rim, one dot per tier and the count the tier took', () => {
    const body = render(Badge, { props: { badge: at(10, 3), size: 96 } }).body
    expect(body).toContain('url(#bm3)')
    expect(body.match(/ opacity="\.55"/g)).toHaveLength(3)
    expect(body).toContain('×10')
    expect(body).toContain('aria-label="ONE HUNDRED AND EIGHTYYY, tier 3"')
  })
  it('greys a badge not earned yet and locks it, with the first rim', () => {
    const body = render(Badge, { props: { badge: at(0, 0) } }).body
    expect(body).toContain('grayscale(1)')
    expect(body).toContain('url(#bm1)')
    expect(body).toContain('not earned yet')
    expect(body).not.toContain('×')
  })
  it('leaves the pill out of a small badge and fills the ring on request', () => {
    expect(render(Badge, { props: { badge: at(10, 3), size: 28 } }).body).not.toContain('×10')
    expect(render(Badge, { props: { badge: at(14, 3), fraction: true } }).body).toContain('stroke-dasharray')
  })
})

describe('AchievementCard', () => {
  it('shows tier, progress to the next one and the showcase state', () => {
    const body = render(AchievementCard, {
      props: { badge: at(14, 3), showcase: { shown: false, full: false, toggle: () => undefined } },
    }).body
    expect(body).toContain('Tier 3 · Gold')
    expect(body).toContain('14 / 20 to Platinum')
    expect(body).toContain('Add to showcase')
  })
  it('says why a badge cannot be shown', () => {
    expect(
      render(AchievementCard, { props: { badge: at(0, 0), showcase: { shown: false, full: false, toggle: () => undefined } } }).body,
    ).toContain('Earn it to show it')
    expect(
      render(AchievementCard, { props: { badge: at(14, 3), showcase: { shown: false, full: true, toggle: () => undefined } } }).body,
    ).toContain('Showcase')
  })
  it('greys the whole card of a badge not earned yet, and only that one', () => {
    // The badge art greys itself with an inline filter, so look at the article's own class
    const onArticle = /<article[^>]*class="[^"]*\bgrayscale\b/
    expect(render(AchievementCard, { props: { badge: at(0, 0) } }).body).toMatch(onArticle)
    expect(render(AchievementCard, { props: { badge: at(14, 3) } }).body).not.toMatch(onArticle)
  })
  it('lists each tier reached, linking the visit where the viewer may open the game', () => {
    const badge = at(10, 2)
    const where = { visit: 4, leg: 0, legVisit: 3, darts: Array.from({ length: 3 }, () => ({ number: 20, multiplier: 3 })), dart: null }
    badge.tiers = [
      { ...badge.tiers[0], where, gameId: 'g1' },
      { ...badge.tiers[1], where, gone: true },
    ]
    const body = render(AchievementCard, { props: { badge } }).body
    expect(body).toContain('href="#/stats/history/g1?visit=4"')
    expect(body).toContain('Leg 1, visit 3 · T20 T20 T20')
    expect(body).toContain('Game no longer available')
    expect(body.match(/href="#\/stats\/history/g)).toHaveLength(1)
  })
  it('marks a new tier', () => {
    expect(render(AchievementCard, { props: { badge: at(14, 3), isNew: true } }).body).toContain('aria-label="New"')
  })
})

describe('AchievementList and ShowcaseBar', () => {
  const badges = ACHIEVEMENTS.map(d => badgeOf(d, undefined))
  it('lists every badge under its category with the filter counts', () => {
    const body = render(AchievementList, { props: { badges } }).body
    expect(body).toContain('Countdown')
    expect(body).toContain('games typed in by hand on the keypad don')
    expect(body).not.toContain('Tiers go')
    expect(body).toContain('X01 · 121')
    expect(body).toContain(`0 of ${badges.length} earned`)
    for (const d of ACHIEVEMENTS) expect(body).toContain(`aria-label="${d.name.replace('&', '&amp;')}"`)
  })
  it('shows the empty slots of the showcase', () => {
    const body = render(ShowcaseBar, { props: { slots: [at(10, 3)], max: 5, remove: () => undefined } }).body
    expect(body).toContain('>1 <span')
    expect(body.match(/Empty slot/g)).toHaveLength(4)
    expect(body).toContain('w-min')
    expect(body).toContain('Remove ONE HUNDRED AND EIGHTYYY from the showcase')
  })
  it('says typed-in darts do not count, unless the flag lets them', () => {
    const note = 'typed in by hand'
    manualDarts.set(false)
    expect(render(AchievementList, { props: { badges } }).body).toContain(note)
    manualDarts.set(true)
    expect(render(AchievementList, { props: { badges } }).body).not.toContain(note)
    manualDarts.set(false)
  })
})
