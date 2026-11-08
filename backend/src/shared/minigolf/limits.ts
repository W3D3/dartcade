// What one player may keep: enforced by the API (admins and official content are exempt), shown by the editor.
export const MINIGOLF_LIMITS = {
  /** Courses a player owns, drafts and published together. */
  courses: 10,
  /** Of those, how many may be public at once. */
  published: 5,
  /** Holes a player owns, in all their courses and the library. */
  holes: 60,
  /** Holes in one player's course. */
  courseHoles: 18,
} as const

export type MinigolfLimit = keyof typeof MINIGOLF_LIMITS

/** The longest a course's name and description may be (they are shown to other players). */
export const COURSE_TEXT_MAX = { name: 40, description: 280 } as const
