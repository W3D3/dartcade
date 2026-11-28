// What Dungeon's screens show, worked out from the snapshot: colours, room names, the map's
// layout, the vote and the sprites' pixels. No components here, so it is tested on its own.
import type { Component } from 'svelte'
import { CircleQuestionMark, Crown, Flame, Gem, ShoppingBag, Skull, Swords } from '@lucide/svelte'
import type { DungeonGame } from '$lib/api/game-ws'
import { isClassId, type ClassId } from '$shared/dungeon/content/classes'
import type { RoomType } from '$shared/dungeon/content/rooms'
import type { Rarity } from '$shared/dungeon/content/types'
import { roomsAbove, type MapRoom } from '$shared/dungeon/map'
import type { Side } from '$shared/dungeon/hit'
import type { Sprite } from './sprites'

/** The rarity outline and label colours (the artboards'). */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9aa0aa',
  uncommon: '#4cc38a',
  rare: '#4b9bff',
  epic: '#b66bff',
  legendary: '#f2c14e',
}

/** A hero's class, null until they picked one. */
export const classOf = (hero: Pick<DungeonGame['heroes'][number], 'classId'>): ClassId | null =>
  hero.classId && isClassId(hero.classId) ? hero.classId : null

/** A class's colour: its HP bar, its bars on the summary. */
export const CLASS_COLOR: Record<ClassId, string> = {
  archer: '#3f9d52',
  brawler: '#d0453b',
  healer: '#f0ebe0',
  mage: '#8f6bff',
  guardian: '#4a78d0',
}

export type RoomInfo = { label: string; description: string; icon: Component }

/** Each room type's name, the line the vote card says about it, and its map icon. */
export const ROOMS: Record<RoomType, RoomInfo> = {
  fight: { label: 'Fight', description: 'A fight. Win it for gold.', icon: Swords },
  elite: { label: 'Elite', description: 'A harder fight that pays more gold.', icon: Skull },
  boss: { label: 'Boss', description: 'The Dungeon Warden. Beat it to win the run.', icon: Crown },
  treasure: { label: 'Treasure', description: 'Every hero picks one of three artifacts.', icon: Gem },
  rest: { label: 'Rest', description: 'Every hero heals by the score of one visit.', icon: Flame },
  event: { label: 'Event', description: 'Something happens; the party votes on what to do.', icon: CircleQuestionMark },
  shop: { label: 'Shop', description: 'Not open yet: the party passes through.', icon: ShoppingBag },
}

/** A room type's icon colour on the map and its legend (the artboards'). */
export const ROOM_TONE: Record<RoomType, string> = {
  fight: '#b3a8c4',
  elite: '#ff6b5e',
  boss: '#e0463c',
  treasure: '#b66bff',
  rest: '#5bd37a',
  event: '#5aa0e8',
  shop: '#f2c14e',
}

export type Rect = { x: number; y: number; w: number; h: number; fill: string }

/**
 * The sprite as rectangles, one per run of equal pixels in a row. With `outline`, every empty pixel
 * that touches the sprite (diagonals too) is drawn in that colour first: the rarity outline.
 */
export function spriteRects(sprite: Sprite, outline: string | null = null): Rect[] {
  const at = (x: number, y: number) => (sprite.rows[y]?.[x] ?? '.') !== '.'
  const colour = (x: number, y: number): string | null => {
    const c = sprite.rows[y][x]
    if (c !== '.') return sprite.palette[parseInt(c, 36)] ?? sprite.palette[36 + c.charCodeAt(0) - 65]
    if (!outline) return null
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) return outline
    return null
  }
  const out: Rect[] = []
  for (let y = 0; y < sprite.h; y++) {
    let x = 0
    while (x < sprite.w) {
      const fill = colour(x, y)
      let end = x + 1
      while (end < sprite.w && colour(end, y) === fill) end++
      if (fill) out.push({ x, y, w: end - x, h: 1, fill })
      x = end
    }
  }
  return out
}

/** A room on the map drawing: its centre in the map's units (lanes across, floors up from the bottom). */
export type MapNode = MapRoom & { floor: number; x: number; y: number; state: 'taken' | 'here' | 'next' | 'ahead' | 'missed' }

/**
 * The map as nodes and the paths between them. `x` runs 0..1 across the lanes, `y` 0..1 from the top
 * (the boss) to the bottom (floor 1). A room is taken (on the path), here, next (one of the ways up),
 * ahead (still reachable) or missed (passed by).
 */
export function mapLayout(game: Pick<DungeonGame, 'map' | 'path' | 'floor' | 'room'>): { nodes: MapNode[]; edges: [MapNode, MapNode][] } {
  const { lanes, floors } = game.map
  const span = Math.max(1, floors.length - 1)
  const next = Object.values(roomsAbove(game.map, game.floor, game.room))
  const nodes = floors.flatMap((rooms, i) =>
    rooms.map((r): MapNode => {
      const floor = i + 1
      const state =
        game.path[i] === r.lane
          ? floor === game.floor
            ? 'here'
            : 'taken'
          : next.some(n => n.lane === r.lane && floor === game.floor + 1)
            ? 'next'
            : floor > game.floor
              ? 'ahead'
              : 'missed'
      return { ...r, floor, state, x: (r.lane + 0.5) / lanes, y: 1 - i / span }
    }),
  )
  const edges = nodes.flatMap(a =>
    nodes.filter(b => b.floor === a.floor + 1 && Math.abs(b.lane - a.lane) === 1).map((b): [MapNode, MapNode] => [a, b]),
  )
  return { nodes, edges }
}

export type VoteSide = { side: Side; room: MapRoom; voters: number[]; leading: boolean }

/** The map vote: each way up with who voted for it, how many have voted out of the living heroes. */
export function voteOf(game: Pick<DungeonGame, 'map' | 'floor' | 'room' | 'votes' | 'heroes'>): {
  sides: VoteSide[]
  voted: number
  voters: number
} {
  const ways = roomsAbove(game.map, game.floor, game.room)
  const living = game.heroes.filter(h => h.hp > 0).map(h => h.seat)
  const count = (side: Side) => living.filter(seat => game.votes[seat] === side)
  const most = Math.max(0, count('left').length, count('right').length)
  const sides = (['left', 'right'] as const).flatMap(side => {
    const room = ways[side]
    const voters = count(side)
    return room ? [{ side, room, voters, leading: voters.length > 0 && voters.length === most }] : []
  })
  return { sides, voted: living.filter(seat => game.votes[seat] !== null).length, voters: living.length }
}

/** A dart on that half of the board, for hand entry: a vote without the board. */
export const SIDE_DART = { left: 11, right: 6 } as const satisfies Record<Side, number>

/** Which screen a run shows (DungeonScene.svelte picks the component). */
export type SceneKey = 'party' | 'map' | 'battle' | 'boss' | 'treasure' | 'rest' | 'event' | 'victory' | 'defeat' | 'summary'

export function sceneOf(game: Pick<DungeonGame, 'phase' | 'battle' | 'outcome'>): SceneKey {
  switch (game.phase) {
    case 'setup':
      return 'party'
    case 'battle':
      return game.battle?.room === 'boss' ? 'boss' : 'battle'
    case 'ended':
      return game.outcome ?? 'summary'
    default:
      return game.phase
  }
}
