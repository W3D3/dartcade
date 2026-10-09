import type { Course, Hole } from '../types.js'
import { testCourse } from './test.js'

export const COURSES: readonly Course[] = [testCourse]

export function getCourse(id: string): Course | undefined {
  return COURSES.find(c => c.id === id)
}

/** Up to 9 holes from all courses, in random order (the "Mixed course"). */
export function mixedHoles(rng: () => number): Hole[] {
  const all = COURSES.flatMap(c => c.holes)
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[all[i], all[j]] = [all[j], all[i]]
  }
  return all.slice(0, 9)
}
