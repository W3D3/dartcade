import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, GROUP_ORDER, TRIGGER_GAME, type TriggerKind } from './index.js'
import { GAME_NAMES } from '../gameNames.js'

const groupOf = (trigger: TriggerKind) => TRIGGER_GAME[trigger]

describe('effect groups', () => {
  it('lists every game once, after General', () => {
    expect(GROUP_ORDER[0]).toBeNull()
    expect([...GROUP_ORDER.slice(1)].sort()).toEqual(Object.keys(GAME_NAMES).sort())
  })
  it('the built-in rules come grouped, in the order of the groups', () => {
    const order = DEFAULT_PROFILE.rules.map(r => GROUP_ORDER.indexOf(groupOf(r.when.trigger)))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
  it('Minigolf has Ball sunk, Higher Lower has Life lost, and the other games their own effects', () => {
    const triggers = (game: (typeof GROUP_ORDER)[number]) =>
      DEFAULT_PROFILE.rules.filter(r => groupOf(r.when.trigger) === game).map(r => r.when.trigger)
    expect(triggers('minigolf')).toEqual(['golf.sunk'])
    expect(triggers('hilo')).toEqual(['hilo.lifeLost'])
    expect(triggers('x01')).toEqual(['visit', 'visit', 'bust', 'checkout'])
    expect(triggers('cricket')).toEqual(['cricket.closed'])
    expect(triggers('p121')).toEqual(['p121.made'])
    expect(triggers('atc')).toEqual([]) // Target hit was removed: nothing else to light there yet
    expect(triggers(null)).toEqual(['turn', 'turn', 'game.won', 'bulloff.won', 'takeout.started', 'calibration.finished', 'lobby'])
  })
})
