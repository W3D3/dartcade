// Test holes for the bench. Plain JSON-shaped data: paste from the bench's hole editor.
import type { Course } from '../types.js'

export const testCourse = {
  id: 'test',
  name: 'Test',
  holes: [
    {
      id: 'test-straight',
      name: 'Straight',
      par: 2,
      outline: [
        [0, 0],
        [500, 0],
        [500, 3000],
        [0, 3000],
      ],
      walls: [],
      bumpers: [],
      slopes: [],
      tee: [250, 2750],
      cup: { at: [250, 300], r: 80 },
    },
    {
      id: 'test-dogleg',
      name: 'Dogleg',
      par: 3,
      // An L: tee bottom-left, cup top-right, bank off the corner
      outline: [
        [0, 2000],
        [1600, 2000],
        [1600, 0],
        [2500, 0],
        [2500, 900],
        [2200, 900],
        [2200, 2800],
        [0, 2800],
      ],
      walls: [],
      bumpers: [],
      slopes: [
        // A ridge across the lane: putt too soft and the ball rolls back
        { bump: { from: [1000, 2000], to: [1000, 2800], width: 350, strength: 1400 } },
      ],
      tee: [300, 2500],
      cup: { at: [2150, 400], r: 80 },
    },
    {
      id: 'test-summit',
      name: 'Summit',
      par: 3,
      outline: [
        [0, 0],
        [1800, 0],
        [1800, 2600],
        [0, 2600],
      ],
      walls: [
        {
          points: [
            [600, 1700],
            [1200, 1700],
          ],
        },
      ],
      bumpers: [
        { at: [450, 900], r: 60, kick: 600 },
        { at: [1350, 900], r: 60, kick: 600 },
      ],
      slopes: [{ radial: { center: [900, 600], radius: 500, strength: 2000 } }],
      tee: [900, 2350],
      cup: { at: [900, 600], r: 80 },
    },
    {
      id: 'test-mesa',
      name: 'Mesa',
      par: 3,
      outline: [
        [0, 0],
        [1600, 0],
        [1600, 3200],
        [0, 3200],
      ],
      walls: [],
      bumpers: [],
      slopes: [],
      // A plateau 15 cm up with the cup on it: a long ramp up from the tee's side, cliffs elsewhere.
      // Too soft and the ball rolls back down; too hard and it drops off the back. Flat in 2D.
      terrain: [{ mesa: { from: [300, 300], to: [1300, 1100], height: 150, edges: [90, 90, 90, 900] } }],
      tee: [800, 2950],
      cup: { at: [800, 600], r: 80 },
    },
  ],
} satisfies Course
