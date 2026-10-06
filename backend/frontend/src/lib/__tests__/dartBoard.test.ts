import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import DartBoard from '../components/DartBoard.svelte'
import { R, SEGS, segAngle } from '$shared/board'

// The board as server-rendered markup: enough to see which layers it draws
const html = (props: Record<string, unknown> = {}) => render(DartBoard, { props }).body

describe('DartBoard camera still', () => {
  it('draws no picture without a still: the segment fills as always', () => {
    const out = html()
    expect(out).not.toContain('<image')
    expect(out).toContain('fill="#d23b36"')
  })

  it('draws the still under the marks, over three board units each way of the bull (r = 1 at a third)', () => {
    const out = html({
      cameraSrc: '/api/boards/b1/camera/0?v=5',
      darts: [{ segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 }, score: 60, coords: { x: 0, y: 0.6 } }],
    })
    const image = /<image[^>]*>/.exec(out)?.[0] ?? ''
    expect(image).toContain('href="/api/boards/b1/camera/0?v=5"')
    expect(image).toContain('x="-1.5"')
    expect(image).toContain('y="-1.5"')
    expect(image).toContain('width="3"')
    expect(image).toContain('height="3"')
    // Under the dart marker and the numbers
    expect(out.indexOf('<image')).toBeLessThan(out.indexOf('fill="var(--color-accent)"'))
    expect(out.indexOf('<image')).toBeLessThan(out.indexOf('>20<'))
    // The real board shows instead of the segment fills
    expect(out).not.toContain('fill="#d23b36"')
    expect(out).not.toContain('fill="#e9dfc4"')
  })

  it('places a dart that missed near its actual segment, not at a fixed fallback spot unrelated to it', () => {
    // A near miss by segment 10 ("M10": bed 'Outside', no coords — a bot's add_dart carries
    // no coords, same as a keypad miss entry): must render just past the double wire at
    // segment 10's own angle, not at the generic "can't place this dart" fallback text, which
    // sits at a fixed spot near segment 3 (several wedges away — see shared/board.ts's SEGS).
    const si = SEGS.indexOf(10)
    const a = segAngle(si)
    const r = R.db + 0.08
    const x = r * Math.cos(a)
    const y = r * Math.sin(a)
    const out = html({ darts: [{ segment: { name: 'M10', number: 10, bed: 'Outside', multiplier: 0 }, score: 0 }] })
    expect(out).toContain(`cx="${x}"`)
    expect(out).toContain(`cy="${-y}"`)
    // Not the old fixed-position "can't place this dart" fallback text (reserved for a dart
    // this truly can't resolve any position for, which a miss's near-segment number isn't)
    expect(out).not.toContain('y="1.05"')
  })

  it('hides the picture from screen readers and clips it to the board, zoomed or not', () => {
    const out = html({ cameraSrc: '/api/boards/b1/camera/0?v=5' })
    const image = /<image[^>]*>/.exec(out)?.[0] ?? ''
    expect(image).toContain('aria-hidden="true"')
    // The picture sits in a group clipped by its own round clip path (r 1.12, in board units)
    const group = /<g clip-path="url\(#(photo-clip-[^)]+)\)"[^>]*>\s*(?:<!--[^>]*-->\s*)*<image/.exec(out)
    expect(group).not.toBeNull()
    expect(out).toMatch(new RegExp(`<clipPath id="${group?.[1]}"><circle cx="0" cy="0" r="1.12"`))
  })
})
