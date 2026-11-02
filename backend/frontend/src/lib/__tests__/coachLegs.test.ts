import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import CoachLegs from '../components/coach/CoachLegs.svelte'
import { coachGame } from '$shared/coach'
import { leg, visit } from '$shared/coach/testLegs.js'

// Seat 0 ends on 97 → S20 S20 S20, noted (S17 on 57 leaves 40); seat 1 throws in between.
const legs = [
  leg([
    visit(0, 501, ['S20', 'S20', 'T20']),
    visit(1, 501, ['S1', 'S1', 'S1']),
    visit(0, 401, ['T20', 'T20', 'T20']),
    visit(1, 498, ['S1']),
    visit(0, 221, ['T20', 'T20', 'S4']),
    visit(1, 497, ['S1']),
    visit(0, 97, ['S20', 'S20', 'S20']),
  ]),
]

const rowOf = (html: string, id: string) => html.slice(html.indexOf(`id="${id}"`), html.indexOf('</li>', html.indexOf(`id="${id}"`)))

describe('CoachLegs', () => {
  it("shows a note under the visit it's about, and only the player's visits", () => {
    const { notes } = coachGame(legs, 0, 501)
    const html = render(CoachLegs, { props: { legs, seat: 0, notes } }).body
    expect(notes.map(n => n.visit)).toContain(6)
    expect(rowOf(html, 'coach-0-6')).toContain('Better: ')
    expect(rowOf(html, 'coach-0-6')).toContain('checkout chance')
    expect(rowOf(html, 'coach-0-0')).not.toContain('Better: ')
    expect(html).not.toContain('id="coach-0-1"')
    expect(html).not.toContain('No strategy notes')
  })
})
