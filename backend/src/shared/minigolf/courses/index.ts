import type { Course } from '../types.js'
import { testCourse } from './test.js'

export const COURSES: readonly Course[] = [testCourse]

export function getCourse(id: string): Course | undefined {
  return COURSES.find(c => c.id === id)
}
