// The two places the course editor lives: admins edit every course at #/admin/minigolf, players
// their own at #/minigolf (behind the minigolf.userCourses.enabled flag). The pages and components
// are the same; an Area is what differs.
import type { CourseRow } from './course'

export type Area = { base: string; admin: boolean }

export const ADMIN_AREA: Area = { base: '/admin/minigolf', admin: true }
export const PLAYER_AREA: Area = { base: '/minigolf', admin: false }

/** Admins use either area; everyone else needs the flag, and only the player area. */
export function mayEdit(area: Area, user: { isAdmin: boolean }, userCoursesOn: boolean): boolean {
  return area.admin ? user.isAdmin : user.isAdmin || userCoursesOn
}

/** The courses the list shows: all of them for admins, the player's own in the player area. */
export const listedCourses = (area: Area, courses: CourseRow[], userId: string): CourseRow[] =>
  area.admin ? courses : courses.filter(c => c.ownerUserId === userId)

/** The `limit reached` refusal as a sentence for the person who hit it. */
export function limitMessage(limit: string, max: number): string {
  switch (limit) {
    case 'courses':
      return `You can have ${max} courses. Delete one to make another.`
    case 'published':
      return `You can have ${max} published courses. Unpublish one first.`
    case 'holes':
      return `You can have ${max} holes. Delete one you don't use to make another.`
    case 'courseHoles':
      return `A course can have ${max} holes at most.`
    default:
      return 'You have reached a limit.'
  }
}
