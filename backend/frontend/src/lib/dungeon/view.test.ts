import { describe, expect, it } from 'vitest'
import { SPRITES, type Sprite } from './sprites'
import { mapLayout, spriteRects, voteOf } from './view'
import type { DungeonGame } from '$lib/api/game-ws'

const map: DungeonGame['map'] = {
  lanes: 5,
  floors: [
    [{ lane: 2, type: 'fight' }],
    [
      { lane: 1, type: 'elite' },
      { lane: 3, type: 'rest' },
    ],
    [{ lane: 2, type: 'boss' }],
  ],
}
const hero = (seat: number, hp = 80) => ({ seat, classId: 'archer', healSegment: null, hp, maxHp: 80, block: 0, artifacts: [] })

describe('spriteRects', () => {
  const dot: Sprite = { w: 3, h: 3, palette: ['#111111', '#222222'], rows: ['...', '.01', '...'] }
  it('merges a row into runs and leaves transparent pixels out', () => {
    expect(spriteRects(dot)).toEqual([
      { x: 1, y: 1, w: 1, h: 1, fill: '#111111' },
      { x: 2, y: 1, w: 1, h: 1, fill: '#222222' },
    ])
  })
  it('draws the outline on every empty pixel touching the sprite, diagonals too', () => {
    const rects = spriteRects(dot, '#ff0000')
    const outline = rects.filter(r => r.fill === '#ff0000').reduce((n, r) => n + r.w, 0)
    expect(outline).toBe(7) // the 3x3 frame around a 2x1 sprite, minus nothing: 9 - 2 inside
  })
  it('every sprite reads only colours of its palette', () => {
    for (const s of Object.values(SPRITES)) {
      expect(s.rows).toHaveLength(s.h)
      for (const row of s.rows) expect(row).toHaveLength(s.w)
      for (const r of spriteRects(s)) expect(s.palette).toContain(r.fill)
    }
  })
})

describe('mapLayout', () => {
  it('places floor 1 at the bottom and the boss on top, and joins rooms one lane apart', () => {
    const { nodes, edges } = mapLayout({ map, path: [2], floor: 1, room: 2 })
    expect(nodes.map(n => [n.type, n.y, n.state])).toEqual([
      ['fight', 1, 'here'],
      ['elite', 0.5, 'next'],
      ['rest', 0.5, 'next'],
      ['boss', 0, 'ahead'],
    ])
    expect(edges.map(([a, b]) => `${a.type}>${b.type}`)).toEqual(['fight>elite', 'fight>rest', 'elite>boss', 'rest>boss'])
  })
  it('marks the path taken and the rooms passed by', () => {
    const { nodes } = mapLayout({ map, path: [2, 3, 2], floor: 3, room: 2 })
    expect(nodes.map(n => n.state)).toEqual(['taken', 'missed', 'taken', 'here'])
  })
})

describe('voteOf', () => {
  it('lists each way up with its voters and who leads, counting only living heroes', () => {
    const v = voteOf({ map, floor: 1, room: 2, votes: ['left', null, 'left'], heroes: [hero(0), hero(1), hero(2, 0)] })
    expect(v.voted).toBe(1)
    expect(v.voters).toBe(2)
    expect(v.sides.map(s => [s.side, s.room.type, s.voters, s.leading])).toEqual([
      ['left', 'elite', [0], true],
      ['right', 'rest', [], false],
    ])
  })
})
