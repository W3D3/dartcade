// Where Minigolf reads the published courses when a game starts: the database once index.ts
// sets it, the code courses until then (tests, the bench).
import { COURSES, getCourse } from '../shared/minigolf/courses/index.js'
import type { Hole } from '../shared/minigolf/types.js'

export type CourseSource = {
  /** A published course; undefined if it doesn't exist or was never published. */
  course(id: string): Promise<{ name: string; holes: Hole[] } | undefined>
  /** Every published hole of the official courses (the Mixed course's pool). */
  officialHoles(): Promise<Hole[]>
  officialCourses(): Promise<{ id: string; name: string }[]>
}

const codeCourses: CourseSource = {
  course: id => {
    const c = getCourse(id)
    return Promise.resolve(c && { name: c.name, holes: c.holes })
  },
  officialHoles: () => Promise.resolve(COURSES.flatMap(c => c.holes)),
  officialCourses: () => Promise.resolve(COURSES.map(c => ({ id: c.id, name: c.name }))),
}

let source = codeCourses

export function setCourseSource(s: CourseSource): void {
  source = s
}

export function courseSource(): CourseSource {
  return source
}
