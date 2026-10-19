import { PRESET_180, PRESET_BUSTED, PRESET_GAMESHOT, PRESET_MATCHSHOT } from './presets.js'
import type { BoardTrigger, GameId, Profile, Rule } from './types.js'

/** The seats' colours, from the design tokens; seat 5 on wraps around. */
export const SEAT_COLORS: readonly string[] = ['#c6f24e', '#efeee6', '#ff9b45', '#5ad1e6']
export const seatColor = (seat: number): string => SEAT_COLORS[((seat % SEAT_COLORS.length) + SEAT_COLORS.length) % SEAT_COLORS.length]

// WLED effect ids
const SOLID = 0,
  BLINK = 1,
  BREATHE = 2,
  SPARKLE = 20
const RED = '#ff3b30'

const flash = (trigger: Rule['when']['trigger'], look: Rule['look'], holdMs: number, extra: Partial<Rule['when']> = {}): Rule => ({
  when: { trigger, seats: 'mine', ...extra },
  type: 'flash',
  look,
  holdMs,
})

/** The built-in profile. The first matching rule wins, so specific rules come first. */
export const DEFAULT_PROFILE: Profile = {
  id: 'default',
  name: 'Dartcade default',
  rules: [
    { when: { trigger: 'turn', seats: 'mine' }, type: 'scene', look: { color: 'seat', fx: SOLID, bri: 255 } },
    { when: { trigger: 'turn', seats: 'other' }, type: 'scene', look: { color: '#ffffff', fx: SOLID, bri: 40 } },
    flash('visit', { preset: '180', state: PRESET_180 }, 4000, { total: { op: '=', n: 180 } }),
    flash('visit', { color: 'seat', fx: BREATHE, bri: 255 }, 2000, { total: { op: '>=', n: 100 } }),
    flash('bust', { preset: 'Busted', state: PRESET_BUSTED }, 1500),
    flash('checkout', { preset: 'Gameshot', state: PRESET_GAMESHOT }, 3000),
    flash('game.won', { preset: 'Matchshot', state: PRESET_MATCHSHOT }, 5000),
    flash('atc.hit', { color: 'seat', fx: SOLID, bri: 255 }, 600),
    flash('hilo.lifeLost', { color: RED, fx: BLINK, bri: 255 }, 1500),
    flash('golf.sunk', { color: 'seat', fx: SPARKLE, bri: 255 }, 2000),
    flash('bulloff.won', { color: 'seat', fx: BLINK, bri: 255 }, 2000),
    { when: { trigger: 'takeout.started', seats: 'any' }, type: 'scene', look: { color: '#ffa000', fx: BREATHE, bri: 255, speed: 60 } },
    // WLED fx 41 "Lighthouse": a comet travelling around the strip leaving a fading trail
    { when: { trigger: 'calibration.started', seats: 'any' }, type: 'scene', look: { color: '#a855f7', fx: 41, bri: 255, speed: 128 } },
    { when: { trigger: 'idle', seats: 'any' }, type: 'scene', look: { color: '#c6f24e', fx: BREATHE, bri: 60, speed: 40 } },
  ],
}

const seatsFit = (seats: Rule['when']['seats'], local: boolean) => seats === 'any' || (seats === 'mine') === local

const totalFits = (total: Rule['when']['total'], t: BoardTrigger) =>
  total === undefined || (t.kind === 'visit' && (total.op === '=' ? t.total === total.n : t.total >= total.n))

/** The first rule of the profile that fits the trigger, or null. */
export function match(profile: Profile, t: BoardTrigger, game: GameId | null): Rule | null {
  return (
    profile.rules.find(
      r =>
        r.when.trigger === t.kind &&
        seatsFit(r.when.seats, t.local) &&
        totalFits(r.when.total, t) &&
        (r.when.game === undefined || r.when.game === game),
    ) ?? null
  )
}
