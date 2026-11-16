import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { GameDetail } from '$lib/api'
import MinigolfSection from '$lib/components/details/MinigolfSection.svelte'
import HoleShots from '$lib/components/minigolf/HoleShots.svelte'

const outline = [
  [0, 0],
  [500, 0],
  [500, 3000],
  [0, 3000],
]
const cup = { at: [250, 300], r: 54 }
const putt = [
  [250, 2750],
  [250, 300],
]
const geometry = (name: string) => ({ id: name, name, par: 2, outline, walls: [], bumpers: [], slopes: [], tee: [250, 2800], cup })
const hole = (name: string, paths: number[][][][]) => ({ hole: geometry(name), paths })
const players = [
  { seat: 1, name: 'Phil' },
  { seat: 0, name: 'Luke' },
]
const detail = {
  game: { players },
  detail: {
    mode: 'minigolf',
    course: 'Test',
    holes: [hole('Straight', [[putt], []]), hole('Dogleg', [[], []]), hole('Summit', [[], []])],
    scores: [
      [1, 7],
      [null, null],
      [null, null],
    ],
  },
} as unknown as GameDetail

describe('MinigolfSection', () => {
  it('opens on the summary: the Summary and Shots tabs and the scorecard', () => {
    const { body } = render(MinigolfSection, { props: { detail } })
    expect(body).toMatch(/role="tab"[^>]*>(<!---->)?Summary/)
    expect(body).toMatch(/role="tab"[^>]*>(<!---->)?Shots/)
    expect(body).toContain('Scorecard · Test')
    expect(body).toContain('data-testid="scorecard"')
  })

  it('has one hole tab per hole in the detail, the first picked, showing its strokes', () => {
    const { body } = render(MinigolfSection, { props: { detail, view: 'shots' } })
    expect(body.match(/aria-label="Hole \d, /g)).toEqual(['aria-label="Hole 1, ', 'aria-label="Hole 2, ', 'aria-label="Hole 3, '])
    expect(body).toContain('Hole 1 · Straight')
    expect(body).toContain('points="250,2750 250,300"')
  })

  it('says so on a hole nobody played', () => {
    const { body } = render(MinigolfSection, { props: { detail, view: 'shots', hole: 1 } })
    expect(body).toContain('Hole 2 · Dogleg')
    expect(body).toContain('Nobody played this hole.')
  })
})

describe('HoleShots', () => {
  it("draws the walls, bumpers and heights, every stroke in its seat's colour and lists each player's score", () => {
    const { body } = render(HoleShots, {
      props: {
        hole: {
          ...geometry('Bumpy'),
          walls: [
            {
              points: [
                [0, 200],
                [300, 200],
              ],
            },
          ],
          bumpers: [{ at: [250, 1500], r: 60 }],
          terrain: [{ mesa: { from: [0, 1800], to: [500, 2200], height: 40, edges: [60, 60, 60, 600] } }],
        },
        paths: [[putt], []],
        scores: [1, null],
        players: [{ name: 'Luke' }, { name: 'Phil' }],
        label: 'x',
      },
    })
    // The wall and Luke's putt
    expect(body.match(/<polyline/g)).toHaveLength(2)
    // The felt as the match draws it: a bumper and a plateau, not just the rails
    expect(body).toContain('r="60"')
    expect(body).toContain('data-testid="mesa"')
    expect(body).toMatch(/Luke · 1[\s\S]*Phil · –/)
  })
})
