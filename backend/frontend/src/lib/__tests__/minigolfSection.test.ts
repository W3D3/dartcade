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
const hole = (name: string, paths: number[][][][]) => ({ name, par: 2, outline, cup, paths })
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
  it("draws every stroke in its seat's colour and lists each player's score", () => {
    const { body } = render(HoleShots, {
      props: { hole: { outline, cup }, paths: [[putt], []], scores: [1, null], players: [{ name: 'Luke' }, { name: 'Phil' }], label: 'x' },
    })
    expect(body.match(/<polyline/g)).toHaveLength(1)
    expect(body).toMatch(/Luke · 1[\s\S]*Phil · –/)
  })
})
