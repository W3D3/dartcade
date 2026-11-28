import { describe, expect, it } from 'vitest'
import { render } from 'svelte/server'
import BattleScreen from '$lib/components/dungeon/BattleScreen.svelte'
import EventScreen from '$lib/components/dungeon/EventScreen.svelte'
import RestScreen from '$lib/components/dungeon/RestScreen.svelte'
import RunEndScreen from '$lib/components/dungeon/RunEndScreen.svelte'
import TreasureScreen from '$lib/components/dungeon/TreasureScreen.svelte'
import { dungeonSlots } from '$lib/dartSlots'
import { choosesFor, enemyChips, enemyTurnLines, eventOutcomeLines, fresh, litPath, traceLines } from '$lib/dungeon/battle'

import { controls, dart, fight, game, names, resolved, send, skeleton, slime, view } from './dungeonFixtures'

describe('the battle log', () => {
  it('writes each dart with what fired, the damage and the kill, then the total', () => {
    const lines = traceLines(resolved.trace, 'Lena', [slime, skeleton])
    expect(lines[0]).toBe('Lena throws S19. Whetstone Rune +10, Brawler x1.5, Weak x2: 87 damage to Slime, killed.')
    expect(lines.some(l => l.includes('killed'))).toBe(true)
    expect(lines.at(-1)).toBe(`Visit: ${resolved.trace.total} damage.`)
  })
  it('says who the enemies hit and what block took', () => {
    const log = {
      attacks: [
        {
          uid: 'e0',
          name: 'Slime Slam',
          hits: [
            { seat: 0, blocked: 4, damage: 2 },
            { seat: 1, blocked: 0, damage: 6 },
          ],
        },
      ],
      burns: [{ uid: 'e1', damage: 3 }],
    }
    expect(enemyTurnLines(log, names, [slime, skeleton])).toEqual([
      'Slime uses Slime Slam: Lena takes 2 (4 blocked), Max takes 6.',
      'Skeleton burns for 3.',
    ])
  })
  it("names an event's decision and what it placed", () => {
    expect(
      eventOutcomeLines(
        { id: 'placeholderForge', decision: 1, cleared: 3, items: [{ number: 5, item: 'stoneWall' }], artifacts: [] },
        names,
      ),
    ).toEqual(['The party chose: Take the Stone Wall.', 'Stone Wall is now on 5.'])
  })
})

describe('the last event', () => {
  it('is news until the party clears another room', () => {
    const lastEvent = { id: 'placeholderShrine', decision: 0, cleared: 2, items: [], artifacts: [] }
    expect(fresh(lastEvent, { cleared: 2 })).toBe(lastEvent)
    expect(fresh(lastEvent, { cleared: 3 })).toBeNull()
  })
})

describe('board and slots', () => {
  it('lights the ring a dart hit: one wedge for a treble, both single beds for a single, nothing for a miss', () => {
    expect(litPath(20, 'treble')?.match(/Z/g)).toHaveLength(1)
    expect(litPath(20, 'single')?.match(/Z/g)).toHaveLength(2)
    expect(litPath(0, 'miss')).toBeNull()
  })
  it('shows the score until the visit resolved, then the damage', () => {
    const darts = [dart('S19', 19, 1, 19)]
    expect(dungeonSlots({ darts, damage: null })[0].points).toBe('19')
    expect(dungeonSlots({ darts, damage: [44] })[0].points).toBe('44 dmg')
    expect(dungeonSlots({ darts, damage: null })).toHaveLength(3)
  })
  it('lets the host or the seat’s controller choose, never the big screen', () => {
    expect(choosesFor(1, { mySeats: [1], host: false, viewOnly: false })).toBe(true)
    expect(choosesFor(1, { mySeats: [0], host: true, viewOnly: false })).toBe(true)
    expect(choosesFor(1, { mySeats: [0], host: false, viewOnly: false })).toBe(false)
    expect(choosesFor(1, { mySeats: [1], host: true, viewOnly: true })).toBe(false)
  })
})

describe('enemyChips', () => {
  it('shows the defences in short and the statuses only while they are on', () => {
    expect(
      enemyChips({ ...view(skeleton), weak: [{ ring: 'double' }], immune: [{ number: 7 }, { number: 3 }] }).map(c => [c.kind, c.value]),
    ).toEqual([
      ['weak', 'D'],
      ['immune', '7·3'],
    ])
    const hurt = enemyChips({ ...view(skeleton), weak: [], immune: [], resist: [{ ring: 'bull' }], chilled: true, burn: 10 })
    expect(hurt.map(c => [c.kind, c.value])).toEqual([
      ['resist', 'B'],
      ['chill', ''],
      ['burn', '10'],
    ])
    expect(hurt[2]?.title).toBe('Burn: 10 damage at the end of the round')
  })
})

describe('BattleScreen', () => {
  it('shows whose visit it is, the enemies with intent, status and defences, and what is left to kill', () => {
    const out = render(BattleScreen, {
      props: { ...fight(game({ battle: { ...game().battle!, enemies: [{ ...view(slime), burn: 4, chilled: true }, view(skeleton)] } })) },
    }).body
    expect(out).toContain('Lena throws')
    expect(out).toContain('Round 2')
    expect(out).toContain('Next: Slime Slam, 6 damage to every hero')
    expect(out).toContain('Burn: 4 damage at the end of the round')
    expect(out).toContain('Chill: its attack does 25% less')
    expect(out).toContain('Weak: doubles (double damage)')
    expect(out).toContain('Immune: 7 (no damage)')
    expect(out).toContain('40 to kill')
    expect(out).toContain('Block 5')
    expect(out).toContain('Pin Cushion, common artifact')
  })
  it('lights each thrown dart and, once resolved, lists the visit and its damage per dart', () => {
    const darts = [dart('S19', 19, 1, 19), dart('D20', 20, 2, 40), dart('Miss', 0, 0, 0)]
    const out = render(BattleScreen, {
      props: { ...fight(game({ visitLocked: true, trace: resolved.trace, currentVisitDarts: darts })) },
    }).body
    expect(out.match(/data-testid="lit-segment"/g)).toHaveLength(2)
    // The popup starts empty and plays in the browser; the plain trace is under Details from the start
    expect(out).toContain('data-testid="damage-popup"')
    expect(out).toContain('Lena’s visit')
    expect(out).toContain(`Visit: ${resolved.trace.total} damage.`)
    expect(out).toContain(`${resolved.trace.darts[0].damage} dmg`)
    expect(out).not.toContain('to kill')
  })
  it('keeps the enemy the visit hit as the target while the popup plays, not the next one the view moved on to', () => {
    const darts = [dart('S19', 19, 1, 19), dart('D20', 20, 2, 40), dart('Miss', 0, 0, 0)]
    // After the kill the view's target is the skeleton; the popup starts on the slime it hit
    const after = { ...game().battle!, target: 'e1', enemies: [{ ...view(slime), hp: 0 }, view(skeleton)] }
    const out = render(BattleScreen, {
      props: { ...fight(game({ visitLocked: true, trace: resolved.trace, currentVisitDarts: darts, battle: after })) },
    }).body
    expect(out).toContain('on Slime')
    expect(out.match(/data-front="true"[^>]*>[\s\S]*?<span class="truncate">([^<]+)</)?.[1]).toBe('Slime')
  })
  it('marks the boss and shows the last enemy turn', () => {
    const lastEnemyTurn = { attacks: [{ uid: 'e0', name: 'Slime Slam', hits: [{ seat: 1, blocked: 0, damage: 9 }] }], burns: [] }
    const out = render(BattleScreen, { props: { ...fight(game({ battle: { ...game().battle!, room: 'boss', lastEnemyTurn } })) } }).body
    expect(out).toContain('Boss')
    expect(out).toContain('Slime uses Slime Slam: Max takes 9.')
  })
  it('opens the boss fight behind its entrance until the first dart', () => {
    const boss = { ...game().battle!, room: 'boss' as const, round: 1, enemies: [{ ...view(slime), kind: 'dungeonWarden' }] }
    const intro = render(BattleScreen, { props: { ...fight(game({ battle: boss, trace: null })) } }).body
    expect(intro).toContain('data-testid="dungeon-boss"')
    expect(intro).toContain('Opens with Slime Slam')
    expect(intro).not.toContain('lit-segment')
    const thrown = render(BattleScreen, {
      props: { ...fight(game({ battle: boss, trace: null, currentVisitDarts: [dart('S19', 19, 1, 19)] })) },
    }).body
    expect(thrown).not.toContain('data-testid="dungeon-boss"')
  })
  it('hides Undo and Next on the big screen', () => {
    const out = render(BattleScreen, { props: { ...fight(game()), viewOnly: true } }).body
    expect(out).not.toContain('Next player')
  })
})

describe('room screens', () => {
  const offers = [['pinCushion', 'twinBuckler'], ['pinCushion']]
  it('treasure: my seat can take a card, another seat only shows its choice', () => {
    const out = render(TreasureScreen, {
      props: { game: game({ phase: 'treasure', battle: null, offers }), names, mySeats: [0], host: false, viewOnly: false, send },
    }).body
    expect(out).toContain('Choosing now: tap one')
    expect(out).toContain('Choosing now<')
    expect(out.match(/<button type="button" data-testid="offer"/g)).toHaveLength(2)
    expect(out.match(/data-testid="offer"/g)).toHaveLength(3)
    expect(out).toContain('Pin Cushion')
  })
  it('rest: the hero up heals by the visit so far, capped at max HP', () => {
    const out = render(RestScreen, {
      props: {
        game: game({ phase: 'rest', battle: null, currentVisitDarts: [dart('T20', 20, 3, 60)], lastHeal: { seat: 1, amount: 7 } }),
        names,
        ...controls,
      },
    }).body
    expect(out).toContain('Lena throws · Heal')
    expect(out).toContain('+10')
    expect(out).toContain('Healed +7 HP')
  })
  it('event: the text, the decisions with their voters, and a vote for my seat that has not voted', () => {
    const g = game({ phase: 'event', battle: null, event: { id: 'placeholderShrine', votes: [null, 2] } })
    const out = render(EventScreen, { props: { game: g, names, mySeats: [0], host: false, viewOnly: false, send } }).body
    expect(out).toContain('A cracked shrine hums')
    expect(out).toContain('1 of 2 voted')
    expect(out).toContain('Lena votes')
    expect(out.match(/<button[^>]*disabled/g)).toBeNull()
    const watching = render(EventScreen, { props: { game: g, names, mySeats: [], host: false, viewOnly: false, send } }).body
    expect(watching).toContain('waiting for the party')
    expect(watching.match(/<button[^>]*disabled/g)).toHaveLength(3)
  })
  it('victory shows the deciding visit and waits for Finish', () => {
    const won = game({ phase: 'ended', outcome: 'victory', winner: 0, battle: null, trace: resolved.trace })
    const finish = { ...controls, next: { label: 'Finish', prominent: true, enabled: true } }
    const out = render(RunEndScreen, { props: { game: won, names, ...finish } }).body
    expect(out).toContain('Victory')
    expect(out).toContain('Finish')
    expect(out).toContain('Lena throws S19')
    expect(render(RunEndScreen, { props: { game: won, names, ...finish, viewOnly: true } }).body).not.toContain('Finish')
  })
  it('defeat says the party fell', () => {
    const out = render(RunEndScreen, {
      props: { game: game({ phase: 'ended', outcome: 'defeat', battle: null }), names, ...controls },
    }).body
    expect(out).toContain('Defeated')
    expect(out).toContain('The party fell on floor')
  })
})
