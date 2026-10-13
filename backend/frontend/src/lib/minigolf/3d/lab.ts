// Holes for trying out 3D physics on the bench: shaped by height, so they only make sense in 3D
// (in 2D they play flat). Not shared with the server.
import type { Course } from '$shared/minigolf/types'
import type { Hole3d } from './ground'

const mesa: Hole3d = {
  id: 'lab-mesa',
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
  // Too soft and the ball rolls back down; too hard and it drops off the back.
  terrain: [{ mesa: { from: [300, 300], to: [1300, 1100], height: 150, edges: [90, 90, 90, 900] } }],
  tee: [800, 2950],
  cup: { at: [800, 600], r: 54 },
}

export const LAB_COURSE: Course = { id: 'lab-3d', name: '3D lab', holes: [mesa] }
