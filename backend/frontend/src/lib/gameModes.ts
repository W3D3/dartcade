// The game modes: the tiles the Play page and the lobby pick from, and what the backend says
// about each (its default settings and their labels), loaded once for both.
import { api, type GameInfo } from '$lib/api'
import { derived } from 'svelte/store'
import { flag } from './flags.js'
import { loadOnce } from './loadOnce.js'

import x01Img from './assets/games/x01.svg'
import atcImg from './assets/games/atc.svg'
import cricketImg from './assets/games/cricket.svg'
import minigolfImg from './assets/games/minigolf.svg'
import p121Img from './assets/games/p121.svg'
import bobsImg from './assets/games/bobs.svg'
import soccerImg from './assets/games/soccer.svg'
import hiloImg from './assets/games/hilo.svg'
import catch40Img from './assets/games/catch40.svg'
import shanghaiImg from './assets/games/shanghai.svg'
import killerImg from './assets/games/killer.svg'
import halveitImg from './assets/games/halveit.svg'

export type GameCategory = 'arcade' | 'classic' | 'practice'

/** The Play page's sections, in order. */
export const GAME_CATEGORIES: { id: GameCategory; name: string; sub: string }[] = [
  { id: 'arcade', name: 'Arcade', sub: 'Dart minigames for groups' },
  { id: 'classic', name: 'Classic', sub: 'The standards, with full stats' },
  { id: 'practice', name: 'Practice', sub: 'Drills and other games' },
]

/**
 * `glyph`: the lobby dialog's tile label (playable modes only).
 * `flag`: the feature flag that has to be on for the mode to show (see lib/flags.ts).
 * `img`: the Play page card's illustration; `small`: a strip row there, not a card.
 */
export type GameMode = {
  id: string
  glyph?: string
  name: string
  desc: string
  cat: GameCategory
  img: string
  available: boolean
  small?: boolean
  flag?: string
}

export const GAME_MODES: GameMode[] = [
  { id: 'x01', glyph: 'X01', name: 'X01', desc: 'Count down from 501. Finish on a double.', cat: 'classic', img: x01Img, available: true },
  { id: 'atc', glyph: 'ATC', name: 'ATC', desc: 'Around the Clock: 1 to 20, then the bull.', cat: 'classic', img: atcImg, available: true },
  {
    id: 'cricket',
    name: 'Cricket',
    desc: 'Close 15 to 20 and bull, then score.',
    cat: 'classic',
    img: cricketImg,
    available: false,
  },
  {
    id: 'minigolf',
    glyph: 'Par 3',
    name: 'Minigolf',
    desc: 'Your dart is the putter. Sink it under par.',
    cat: 'arcade',
    img: minigolfImg,
    available: true,
    flag: 'gamemode.minigolf.enabled',
  },
  {
    id: 'p121',
    glyph: '121',
    name: '121',
    desc: 'Check out 121 in nine darts, then go higher.',
    cat: 'practice',
    img: p121Img,
    available: true,
    flag: 'gamemode.p121.enabled',
  },
  {
    id: 'bobs',
    name: "Bob's 27",
    desc: 'Doubles 1 to 20. Hits add, misses cost.',
    cat: 'practice',
    img: bobsImg,
    available: false,
  },
  {
    id: 'soccer',
    name: 'Soccer',
    desc: 'Win the ball, then hit the goal zone first.',
    cat: 'practice',
    img: soccerImg,
    available: false,
  },
  {
    id: 'hilo',
    name: 'Higher Lower',
    desc: 'Call it: next visit higher or lower?',
    cat: 'practice',
    img: hiloImg,
    available: false,
    small: true,
  },
  {
    id: 'catch40',
    name: 'Catch 40',
    desc: 'Checkouts 61 to 100 in six darts.',
    cat: 'practice',
    img: catch40Img,
    available: false,
    small: true,
  },
  {
    id: 'shanghai',
    name: 'Shanghai',
    desc: 'Single, double, treble of one number wins.',
    cat: 'practice',
    img: shanghaiImg,
    available: false,
    small: true,
  },
  {
    id: 'killer',
    name: 'Killer',
    desc: 'Hit your double to arm, then take lives.',
    cat: 'practice',
    img: killerImg,
    available: false,
    small: true,
  },
  {
    id: 'halveit',
    name: 'Halve-it',
    desc: 'Miss the target and your score halves.',
    cat: 'practice',
    img: halveitImg,
    available: false,
    small: true,
  },
]

/** The modes to show: those without a flag, and those whose flag is on. */
export function visibleModes(modes: readonly GameMode[], isOn: (flag: string) => boolean): GameMode[] {
  return modes.filter(m => m.flag === undefined || isOn(m.flag))
}

const flagKeys = GAME_MODES.flatMap(m => (m.flag ? [m.flag] : []))

/** The modes to show, as their flags stand (flagged modes stay hidden until the flags have loaded). */
export const shownModes = derived(
  flagKeys.map(k => flag(k)),
  values => visibleModes(GAME_MODES, k => values[flagKeys.indexOf(k)] ?? false),
)

/** The saved mode if the backend lists it (it leaves out modes whose flag is off), else its first. */
export function listedMode(saved: string, games: readonly { id: string }[]): string {
  return games.some(g => g.id === saved) ? saved : (games[0]?.id ?? saved)
}

/** The modes the backend has, with their defaults and settings meta; [] until loaded. */
export const gameModes = loadOnce<GameInfo[]>(async () => {
  const { data } = await api.GET('/api/gamemodes')
  if (!data) throw new Error('no game modes')
  return data.modes
}, [])

/** A mode's settings: the saved ones over its defaults, so every field the form reads exists. */
export function withDefaults(saved: Record<string, unknown>, defaults: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...(defaults ?? {}), ...saved }
}

/** Whether the next game can switch to this mode: picked, playable, known to the backend, and not the current one. */
export function canSwitchTo(picked: string | null, current: string | null, games: GameInfo[]): boolean {
  if (!picked || picked === current) return false
  return GAME_MODES.some(m => m.id === picked && m.available) && games.some(g => g.id === picked)
}

/**
 * The settings changes still on their way to the lobby's snapshot: those it doesn't show yet,
 * minus those whose save already came back (`settled`, the values sent) — a snapshot after
 * the save shows what the server kept, even if that's not what was sent.
 */
export function settlePending(
  pending: Record<string, unknown>,
  saved: Record<string, unknown>,
  settled: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(pending).filter(([key, value]) => value !== saved[key] && !(key in settled && settled[key] === value)),
  )
}
