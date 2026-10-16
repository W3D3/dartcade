// A beginner's course: each hole brings in one new idea (rails, a bowl, a ridge, a block, terrain,
// bumpers), shown first where it helps, then asked of the player; the last hole puts them together.
import type { Course } from '../types.js'

export const greenhornCourse = {
  id: 'greenhorn',
  name: 'Greenhorn Park',
  holes: [
    {
      // Just power: a wide, straight lane with a big cup
      id: 'greenhorn-first-putt',
      name: 'First Putt',
      par: 2,
      outline: [
        [0, 0],
        [800, 0],
        [800, 2600],
        [0, 2600],
      ],
      walls: [],
      bumpers: [],
      slopes: [],
      tee: [400, 2350],
      cup: { at: [400, 450], r: 110 },
    },
    {
      // Two ridges 6 cm high: the second has a low gap off to the side, a softer line for a sharper aim
      id: 'greenhorn-double-bump',
      name: 'Double Bump',
      par: 2,
      outline: [
        [0, 0],
        [1000, 0],
        [1000, 3400],
        [0, 3400],
      ],
      walls: [],
      bumpers: [],
      slopes: [],
      terrain: [
        { mesa: { from: [1, 2250], to: [999, 2350], height: 60, edges: [1, 450, 1, 450] } },
        { mesa: { from: [1, 1200], to: [450, 1300], height: 60, edges: [1, 450, 150, 450] } },
        { mesa: { from: [850, 1200], to: [999, 1300], height: 60, edges: [150, 450, 1, 450] } },
      ],
      tee: [500, 3150],
      cup: { at: [500, 450], r: 100 },
    },
    {
      // The straight line is walled off: aim for the gate and the bowl round the cup does the rest
      id: 'greenhorn-the-funnel',
      name: 'The Funnel',
      par: 2,
      outline: [
        [0, 0],
        [1400, 0],
        [1400, 2900],
        [0, 2900],
      ],
      walls: [
        {
          points: [
            [0, 1500],
            [300, 1500],
          ],
        },
        {
          points: [
            [750, 1500],
            [1400, 1500],
          ],
        },
      ],
      bumpers: [],
      slopes: [{ radial: { center: [700, 750], radius: 600, strength: -1500 } }],
      tee: [1050, 2600],
      cup: { at: [700, 750], r: 110 },
    },
    {
      // Rails: no straight line, but the cut corner banks the ball round the bend; a putt from the double
      // off the corner can drop for a hole in one
      id: 'greenhorn-gentle-bend',
      name: 'Gentle Bend',
      par: 3,
      outline: [
        [0, 600],
        [600, 0],
        [2000, 0],
        [2000, 900],
        [900, 900],
        [900, 2300],
        [0, 2300],
      ],
      walls: [],
      bumpers: [],
      slopes: [],
      tee: [450, 2050],
      cup: { at: [1650, 450], r: 110 },
    },
    {
      // Three lanes: the short middle one squeezes past a bumper, the side ones are safe but longer
      id: 'greenhorn-three-ways',
      name: 'Three Ways',
      par: 3,
      outline: [
        [0, 700],
        [700, 0],
        [1500, 0],
        [2200, 700],
        [2200, 3000],
        [0, 3000],
      ],
      walls: [
        {
          points: [
            [800, 1200],
            [800, 2000],
          ],
        },
        {
          points: [
            [1400, 1200],
            [1400, 2000],
          ],
        },
      ],
      bumpers: [{ at: [1100, 1600], r: 80, kick: 300 }],
      slopes: [],
      tee: [1100, 2750],
      cup: { at: [1100, 550], r: 100 },
    },
    {
      // A block walls off the straight line; the lanes either side lean in towards it, so aim up the
      // outside and let the slope carry the ball round to the cup
      id: 'greenhorn-sidehill',
      name: 'Sidehill',
      par: 3,
      outline: [
        [0, 500],
        [500, 0],
        [1500, 0],
        [2000, 500],
        [2000, 3300],
        [0, 3300],
      ],
      walls: [
        {
          closed: true,
          points: [
            [800, 1000],
            [1200, 1000],
            [1200, 2300],
            [800, 2300],
          ],
        },
      ],
      bumpers: [],
      slopes: [],
      terrain: [
        { mesa: { from: [1, 900], to: [2, 2400], height: 100, edges: [1, 300, 797, 300] } },
        { mesa: { from: [1998, 900], to: [1999, 2400], height: 100, edges: [797, 300, 1, 300] } },
      ],
      tee: [1000, 3000],
      cup: { at: [1000, 450], r: 100 },
    },
    {
      // A U-turn round a long wall: a firm putt loops off both cut corners, two soft ones are safe too
      id: 'greenhorn-hairpin',
      name: 'Hairpin',
      par: 3,
      outline: [
        [0, 600],
        [600, 0],
        [1400, 0],
        [2000, 600],
        [2000, 2800],
        [0, 2800],
      ],
      walls: [
        {
          points: [
            [1000, 2800],
            [1000, 900],
          ],
          thickness: 40,
        },
      ],
      bumpers: [],
      slopes: [],
      tee: [500, 2500],
      cup: { at: [1500, 1700], r: 100 },
    },
    {
      // Bumpers guard the cup and kick the ball about: a little chaos, never a dead end
      id: 'greenhorn-pinball',
      name: 'Pinball',
      par: 3,
      outline: [
        [0, 0],
        [1800, 0],
        [1800, 3000],
        [0, 3000],
      ],
      walls: [],
      bumpers: [
        { at: [550, 1150], r: 60, kick: 500 },
        { at: [1250, 1150], r: 60, kick: 500 },
        { at: [900, 1700], r: 80, kick: 500 },
      ],
      slopes: [],
      tee: [900, 2700],
      cup: { at: [900, 600], r: 90 },
    },
    {
      // The finale: a tall ridge, a bumper gate round the bend and the cup on a crown, so it has to
      // arrive gently
      id: 'greenhorn-grand-finale',
      name: 'Grand Finale',
      par: 3,
      outline: [
        [0, 0],
        [2000, 0],
        [2600, 600],
        [2600, 3200],
        [1700, 3200],
        [1700, 900],
        [0, 900],
      ],
      walls: [],
      bumpers: [
        { at: [1250, 200], r: 60, kick: 400 },
        { at: [1250, 700], r: 60, kick: 400 },
      ],
      slopes: [{ radial: { center: [450, 450], radius: 380, strength: 600 } }],
      terrain: [{ mesa: { from: [1701, 2000], to: [2599, 2100], height: 60, edges: [1, 450, 1, 450] } }],
      tee: [2150, 2950],
      cup: { at: [450, 450], r: 80 },
    },
  ],
} satisfies Course
