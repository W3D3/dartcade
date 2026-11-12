import { PRESET_180, PRESET_BUSTED, PRESET_GAMESHOT, PRESET_MATCHSHOT } from './presets.js'
import type { BoardTrigger, GameId, Profile, Rule } from './types.js'

/** The seats' colours; seat 7 on wraps around. Checked for colour blindness (normal, deuteranopia,
 *  protanopia: CIE76 distance 17+ between any two), and none is near the takeout yellow (28+ even
 *  with deuteranopia). Tritanopia cannot tell off-white from that yellow, which no white avoids. */
export const DEFAULT_SEAT_COLORS: readonly string[] = ['#56d4e8', '#efeee6', '#ff5a1f', '#ff4fa3', '#7c5cff', '#2ecf8f']

/** How many seat colours a profile has, and so how many a board can edit. */
export const SEAT_COLOR_COUNT = DEFAULT_SEAT_COLORS.length

/** The colour of a seat (0-based). A seat past the last colour wraps around to the first. */
export const seatColor = (seat: number, colors: readonly string[]): string =>
  colors[((seat % colors.length) + colors.length) % colors.length]

/** WLED effect ids used by the built-in profile, by the name the Effects list shows. */
export const FX = { solid: 0, blink: 1, pulse: 2, rainbow: 9, sparkle: 20, comet: 41, fireworks: 42 } as const
const { solid: SOLID, blink: BLINK, pulse: BREATHE, sparkle: SPARKLE, comet: COMET, fireworks: FIREWORKS } = FX
const RED = '#ff3b30'
const PURPLE = '#a855f7'
/** Hue 50: clearly yellow, apart from the orange seat colour (the old amber looked like it). */
/** The lobby effect's colour, also a seat palette entry. Stored LED data, not the UI accent. */
export const LIME = '#c6f24e'
export const TAKEOUT_YELLOW = '#ffd60a'

const flash = (trigger: Rule['when']['trigger'], look: Rule['look'], holdMs: number, extra: Partial<Rule['when']> = {}): Rule => ({
  when: { trigger, seats: 'mine', ...extra },
  type: 'flash',
  enabled: true,
  look,
  holdMs,
})

/** How long the built-in Calibrated flash plays; the scene comes back after it. */
export const CALIBRATED_HOLD_MS = 3000

/** The built-in profile. The first matching rule wins, so specific rules come first. */
export const DEFAULT_PROFILE: Profile = {
  id: 'default',
  name: 'Dartcade default',
  seatColors: DEFAULT_SEAT_COLORS,
  rules: [
    // General: every game
    { when: { trigger: 'turn', seats: 'mine' }, type: 'scene', enabled: true, look: { color: 'seat', fx: SOLID, bri: 255 } },
    { when: { trigger: 'turn', seats: 'other' }, type: 'scene', enabled: true, look: { color: '#ffffff', fx: SOLID, bri: 40 } },
    flash('game.won', { preset: 'Matchshot', state: PRESET_MATCHSHOT }, 5000),
    flash('bulloff.won', { color: 'seat', fx: BLINK, bri: 255 }, 2000),
    {
      when: { trigger: 'takeout.started', seats: 'any' },
      type: 'scene',
      enabled: true,
      look: { color: TAKEOUT_YELLOW, fx: BREATHE, bri: 255, speed: 60 },
    },
    // Once, after the Board Manager finishes calibrating (the lights stay as they are while it calibrates).
    // WLED "Lighthouse": a comet travelling around the strip leaving a fading trail
    flash('calibration.finished', { color: PURPLE, fx: COMET, bri: 255, speed: 128 }, CALIBRATED_HOLD_MS, { seats: 'any' }),
    // Lobby: only shows while someone sits at the board in a lobby with no game running; off unless switched on
    {
      when: { trigger: 'lobby', seats: 'any' },
      type: 'scene',
      enabled: false,
      look: { color: LIME, fx: BREATHE, bri: 60, speed: 40 },
    },
    // X01
    flash('visit', { preset: '180', state: PRESET_180 }, 4000, { total: { op: '=', n: 180 } }),
    // A big score sparkles white rather than flashing the player's colour
    flash('visit', { color: '#ffffff', fx: SPARKLE, bri: 255 }, 2000, { total: { op: '>=', n: 100 } }),
    flash('bust', { preset: 'Busted', state: PRESET_BUSTED }, 1500),
    flash('checkout', { preset: 'Gameshot', state: PRESET_GAMESHOT }, 3000),
    // Cricket
    flash('cricket.closed', { color: '#ffffff', fx: SPARKLE, bri: 255 }, 1000),
    // 121 Checkout
    flash('p121.made', { color: '#ffffff', fx: FIREWORKS, bri: 255 }, 2000),
    // Minigolf
    flash('golf.sunk', { color: 'seat', fx: SPARKLE, bri: 255 }, 2000),
    // Higher Lower
    flash('hilo.lifeLost', { color: RED, fx: BLINK, bri: 255 }, 1500),
  ],
}

/** An effect's identity in the built-in profile, stable when the list is reordered: its trigger, seats, game and total filter. */
export const ruleKey = (r: Rule): string =>
  [r.when.trigger, r.when.seats, r.when.game ?? '', r.when.total ? `${r.when.total.op}${r.when.total.n}` : ''].join('|')

const seatsFit = (seats: Rule['when']['seats'], local: boolean) => seats === 'any' || (seats === 'mine') === local

const totalFits = (total: Rule['when']['total'], t: BoardTrigger) =>
  total === undefined || (t.kind === 'visit' && (total.op === '=' ? t.total === total.n : t.total >= total.n))

/** The first rule of the profile that fits the trigger, or null. */
export function match(profile: Profile, t: BoardTrigger, game: GameId | null): Rule | null {
  return (
    profile.rules.find(
      r =>
        r.enabled &&
        r.when.trigger === t.kind &&
        seatsFit(r.when.seats, t.local) &&
        totalFits(r.when.total, t) &&
        (r.when.game === undefined || r.when.game === game),
    ) ?? null
  )
}
