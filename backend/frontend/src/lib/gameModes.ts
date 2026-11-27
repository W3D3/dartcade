// The game modes: the tiles the Play page and the lobby pick from, and what the backend says
// about each (its default settings and their labels), loaded once for both.
import { api, type GameInfo } from '$lib/api'
import { derived } from 'svelte/store'
import { flag } from './flags.js'
import type { FlagKey } from '$shared/flags'
import { loadOnce } from './loadOnce.js'
import { GAME_NAMES } from '$shared/gameNames'

import x01Img from './assets/games/x01.svg'
import atcImg from './assets/games/atc.svg'
import cricketImg from './assets/games/cricket.svg'
import minigolfImg from './assets/games/minigolf.svg'
import dungeonImg from './assets/games/dungeon.svg'
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
 * `ink`: the box the art covers in its illustration, as fractions [left, top, right, bottom], so the
 * settings header can size and centre it. e2e/visual/game-icons.spec.ts fails when it is wrong.
 */
export type GameMode = {
  id: string
  glyph?: string
  name: string
  desc: string
  cat: GameCategory
  img: string
  ink: readonly [number, number, number, number]
  available: boolean
  small?: boolean
  flag?: FlagKey
}

// Width over height of a strip's illustration, a card's illustration and the header's art tile
const STRIP_ASPECT = 120 / 80
const CARD_ASPECT = 352 / 188
const TILE_ASPECT = 1.115
/** How much of the tile the art may fill each way, so nothing touches its edge */
const ART_FILL = 0.8

/** The fill every illustration starts with, so the art tile can show an image smaller than itself */
export const ART_BACKGROUND = '#171914'

/** Where the illustration sits in the settings header's art tile (percent of the tile): the whole art, in the middle. */
export function headerArt(mode: GameMode): { width: string; left: string; top: string } {
  const [left, top, right, bottom] = mode.ink
  const aspect = mode.small ? STRIP_ASPECT : CARD_ASPECT
  // The image's width and height in tiles: as big as the art may be
  const width = Math.min(ART_FILL / (right - left), (ART_FILL * aspect) / (TILE_ASPECT * (bottom - top)))
  const height = (width * TILE_ASPECT) / aspect
  return {
    width: `${100 * width}%`,
    left: `${100 * (0.5 - ((left + right) / 2) * width)}%`,
    top: `${100 * (0.5 - ((top + bottom) / 2) * height)}%`,
  }
}

export const GAME_MODES: GameMode[] = [
  {
    id: 'x01',
    ink: [0.502, 0.089, 0.965, 0.949],
    glyph: 'X01',
    name: GAME_NAMES.x01.title,
    desc: 'Count down from 501. Finish on a double.',
    cat: 'classic',
    img: x01Img,
    available: true,
  },
  {
    id: 'atc',
    ink: [0.519, 0.066, 0.938, 0.911],
    glyph: 'ATC',
    name: GAME_NAMES.atc.short,
    desc: 'Around the Clock: 1 to 20, then the bull.',
    cat: 'classic',
    img: atcImg,
    available: true,
  },
  {
    id: 'cricket',
    ink: [0.585, 0.07, 0.95, 0.868],
    glyph: 'CRI',
    name: 'Cricket',
    desc: 'Close 15 to 20 and bull, then score.',
    cat: 'classic',
    img: cricketImg,
    available: true,
    flag: 'gamemode.cricket.enabled',
  },
  {
    id: 'minigolf',
    ink: [0.504, 0.195, 0.963, 0.802],
    glyph: 'Par 3',
    name: GAME_NAMES.minigolf.title,
    desc: 'Your dart is the putter. Sink it under par.',
    cat: 'arcade',
    img: minigolfImg,
    available: true,
    flag: 'gamemode.minigolf.enabled',
  },
  {
    id: 'dungeon',
    ink: [0.483, 0.261, 0.96, 0.739],
    glyph: 'DGN',
    name: GAME_NAMES.dungeon.title,
    desc: 'Fight your way up to the boss as a party.',
    cat: 'arcade',
    img: dungeonImg,
    available: true,
    flag: 'gamemode.dungeon.enabled',
  },
  {
    id: 'p121',
    ink: [0.535, 0.066, 0.985, 0.907],
    glyph: '121',
    name: GAME_NAMES.p121.title,
    desc: 'Check out 121 in nine darts, then go higher.',
    cat: 'practice',
    img: p121Img,
    available: true,
    flag: 'gamemode.p121.enabled',
  },
  {
    id: 'bobs',
    ink: [0.525, 0.058, 0.985, 0.918],
    name: "Bob's 27",
    desc: 'Doubles 1 to 20. Hits add, misses cost.',
    cat: 'practice',
    img: bobsImg,
    available: false,
  },
  {
    id: 'soccer',
    ink: [0.452, 0.152, 0.99, 0.844],
    name: 'Soccer',
    desc: 'Win the ball, then hit the goal zone first.',
    cat: 'practice',
    img: soccerImg,
    available: false,
  },
  {
    id: 'hilo',
    ink: [0.329, 0.194, 0.671, 0.806],
    glyph: 'HiLo',
    name: GAME_NAMES.hilo.title,
    desc: 'Land above the high bar or below the low bar.',
    cat: 'practice',
    img: hiloImg,
    available: true,
    small: true,
    flag: 'gamemode.hilo.enabled',
  },
  {
    id: 'catch40',
    ink: [0.242, 0.113, 0.758, 0.909],
    name: GAME_NAMES.catch40.title,
    desc: 'Check out 61 to 100, one try of six darts each.',
    cat: 'practice',
    img: catch40Img,
    available: true,
    small: true,
    flag: 'gamemode.catch40.enabled',
  },
  {
    id: 'shanghai',
    ink: [0.258, 0.138, 0.742, 0.863],
    name: 'Shanghai',
    glyph: 'SHA',
    desc: 'Single, double, treble of one number wins.',
    cat: 'practice',
    img: shanghaiImg,
    available: true,
    small: true,
    flag: 'gamemode.shanghai.enabled',
  },
  {
    id: 'killer',
    ink: [0.154, 0.106, 0.867, 0.894],
    name: 'Killer',
    desc: 'Hit your double to arm, then take lives.',
    cat: 'practice',
    img: killerImg,
    available: false,
    small: true,
  },
  {
    id: 'halveit',
    ink: [0.173, 0.184, 0.815, 0.816],
    name: 'Halve-it',
    desc: 'Miss the target and your score halves.',
    cat: 'practice',
    img: halveitImg,
    available: false,
    small: true,
  },
]

/** The modes to show: those without a flag, and those whose flag is on. */
export function visibleModes(modes: readonly GameMode[], isOn: (flag: FlagKey) => boolean): GameMode[] {
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
