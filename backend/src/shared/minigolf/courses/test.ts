// Test holes for the bench. Plain JSON-shaped data: paste from the bench's hole editor.
import type { Course } from '../types.js'

export const testCourse = {
  id: 'test',
  name: 'Test',
  holes: [
    {
      id: 'straight',
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
      cup: { at: [250, 300], r: 54 },
    },
    {
      id: 'dogleg',
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
        {
          area: [
            [700, 2000],
            [1300, 2000],
            [1300, 2800],
            [700, 2800],
          ],
          force: [250, 0],
        },
      ],
      tee: [300, 2500],
      cup: { at: [2150, 400], r: 54 },
    },
    {
      id: 'summit',
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
      slopes: [
        {
          area: [
            [600, 300],
            [1200, 300],
            [1200, 900],
            [600, 900],
          ],
          radial: { center: [900, 600], strength: 1500 },
        },
      ],
      tee: [900, 2350],
      cup: { at: [900, 600], r: 54 },
    },
  ],
} satisfies Course
