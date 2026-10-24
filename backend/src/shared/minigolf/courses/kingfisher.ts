// A medium course after the classic concrete-course holes (the gate, the lightning bolt, the
// volcano, the pyramids, the table, the circle): each asks for one precise thing, a line or a
// weight, and a miss costs a stroke rather than the hole.
import { bakeOutline } from '../bake.js'
import type { Course, Hole, Pt, Shape, Wall } from '../types.js'

/** The hole with its outline baked from its shape (corners and round greens). */
function baked(hole: Omit<Hole, 'outline'> & { shape: Shape }): Hole {
  const r = bakeOutline(hole.shape)
  if (!r.ok) throw new Error(`${hole.id}: ${r.reason}`)
  return { ...hole, outline: r.outline }
}

const straight = (corners: Pt[], circles: Shape['circles']): Shape => ({ corners, curves: corners.map(() => null), circles })

/** A square block stood on its corner, `s` from its centre to each corner. */
const diamond = ([x, y]: Pt, s: number): Wall => ({
  closed: true,
  points: [
    [x, y - s],
    [x + s, y],
    [x, y + s],
    [x - s, y],
  ],
})

/** Points on a circle from `from` to `to` degrees (0 is +x, 90 is down the course), every `step`. */
const arc = ([x, y]: Pt, r: number, from: number, to: number, step = 15): Pt[] =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, k) => {
    const a = ((from + k * step) * Math.PI) / 180
    return [Math.round(x + r * Math.cos(a)), Math.round(y + r * Math.sin(a))]
  })

export const kingfisherCourse = {
  id: 'kingfisher',
  name: 'Kingfisher Links',
  holes: [
    baked({
      // The gate: a rail across the lane with one gap in it; through the gap, a round green
      id: 'kingfisher-keyhole',
      name: 'Keyhole',
      par: 2,
      shape: straight(
        [
          [300, 1300],
          [1100, 1300],
          [1100, 3000],
          [300, 3000],
        ],
        [{ center: [700, 800], r: 650 }],
      ),
      walls: [
        {
          points: [
            [300, 1900],
            [625, 1900],
          ],
        },
        {
          points: [
            [785, 1900],
            [1100, 1900],
          ],
        },
      ],
      bumpers: [],
      slopes: [],
      tee: [600, 2750],
      cup: { at: [850, 700], r: 90 },
    }),
    {
      // The lightning bolt: a zigzag with no straight line, two banks to the cup
      id: 'kingfisher-lightning',
      name: 'Lightning',
      par: 2,
      outline: [
        [100, 2700],
        [600, 2700],
        [600, 2150],
        [1800, 1450],
        [1800, 300],
        [1300, 300],
        [1300, 1050],
        [100, 1750],
      ],
      walls: [],
      bumpers: [],
      slopes: [],
      tee: [350, 2450],
      cup: { at: [1550, 650], r: 90 },
    },
    baked({
      // The volcano: the cup on a crown, so a weak putt rolls back and a hard one runs over the top
      id: 'kingfisher-volcano',
      name: 'Volcano',
      par: 2,
      shape: straight(
        [
          [450, 1300],
          [1050, 1300],
          [1050, 3100],
          [450, 3100],
        ],
        [{ center: [750, 850], r: 700 }],
      ),
      walls: [],
      bumpers: [],
      slopes: [{ radial: { center: [750, 1000], radius: 420, strength: 1100 } }],
      tee: [750, 2850],
      cup: { at: [750, 1000], r: 85 },
    }),
    {
      // The pyramids: blocks on their corners wall off the straight line; pick a gap, or a face to bank off
      id: 'kingfisher-pyramids',
      name: 'Pyramids',
      par: 3,
      outline: [
        [0, 500],
        [500, 0],
        [1000, 0],
        [1500, 500],
        [1500, 3300],
        [0, 3300],
      ],
      walls: [diamond([750, 1900], 180), diamond([380, 1250], 160), diamond([1120, 1250], 160), diamond([750, 950], 90)],
      bumpers: [],
      slopes: [],
      tee: [750, 3000],
      cup: { at: [750, 450], r: 90 },
    },
    {
      // The table: the cup on a raised top up a long ramp; too firm drops off the back into the gutter
      id: 'kingfisher-tabletop',
      name: 'Tabletop',
      par: 3,
      outline: [
        [0, 0],
        [1600, 0],
        [1600, 3300],
        [0, 3300],
      ],
      walls: [],
      bumpers: [],
      slopes: [],
      terrain: [{ mesa: { from: [350, 250], to: [1250, 1400], height: 70, edges: [40, 40, 40, 1000] } }],
      tee: [800, 3000],
      cup: { at: [800, 650], r: 85 },
    },
    baked({
      // The circle: a ring guards the cup, open to the side; bank off the round rail into the gap
      id: 'kingfisher-roundabout',
      name: 'Roundabout',
      par: 3,
      shape: straight(
        [
          [500, 1500],
          [1100, 1500],
          [1100, 2600],
          [500, 2600],
        ],
        [{ center: [800, 1000], r: 750 }],
      ),
      walls: [{ points: arc([800, 1000], 260, 30, 330) }],
      bumpers: [],
      slopes: [],
      tee: [800, 2350],
      cup: { at: [800, 1000], r: 90 },
    }),
    baked({
      // Two round greens joined at a narrow waist: the tee sits in a bowl, and a hump in front of the cup bends the putt
      id: 'kingfisher-figure-eight',
      name: 'Figure Eight',
      par: 2,
      shape: straight(
        [],
        [
          { center: [800, 2140], r: 650 },
          { center: [800, 900], r: 650 },
        ],
      ),
      walls: [],
      bumpers: [],
      slopes: [
        { radial: { center: [800, 2140], radius: 500, strength: -500 } },
        { radial: { center: [800, 900], radius: 380, strength: 800 } },
      ],
      tee: [800, 2500],
      cup: { at: [1020, 600], r: 85 },
    }),
    {
      // The slalom: bumpers either side leave one straight lane to the cup; stray and they kick you about
      id: 'kingfisher-slalom',
      name: 'Slalom',
      par: 2,
      outline: [
        [0, 0],
        [700, 0],
        [700, 2900],
        [0, 2900],
      ],
      walls: [],
      bumpers: [
        { at: [195, 2150], r: 70, kick: 250 },
        { at: [505, 1700], r: 70, kick: 250 },
        { at: [195, 1250], r: 70, kick: 250 },
        { at: [505, 800], r: 70, kick: 250 },
      ],
      slopes: [],
      tee: [350, 2650],
      cup: { at: [350, 400], r: 85 },
    },
    baked({
      // The finale: round the corner and up the ramp onto a table in the round green; too firm runs off the far side
      id: 'kingfisher-high-water',
      name: 'High Water',
      par: 4,
      shape: straight(
        [
          [0, 600],
          [600, 0],
          [1600, 0],
          [1600, 1000],
          [700, 1000],
          [700, 3300],
          [0, 3300],
        ],
        [{ center: [1900, 650], r: 650 }],
      ),
      walls: [],
      bumpers: [],
      slopes: [],
      terrain: [{ mesa: { from: [1600, 450], to: [2150, 850], height: 60, edges: [550, 150, 150, 150] } }],
      tee: [350, 3050],
      cup: { at: [1950, 650], r: 85 },
    }),
  ],
} satisfies Course
