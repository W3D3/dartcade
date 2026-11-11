import { hrefs } from '$lib/routes'
// Breadcrumb trails for the admin pages, as plain data: each page renders it with
// $lib/components/ui/breadcrumb and wires any onclick it needs (e.g. an unsaved-changes guard).
import type { BreadcrumbItem } from '$lib/components/ui/breadcrumb/index.js'
import { ADMIN_AREA, type Area } from '$lib/minigolf/editor/area'

const ADMIN: BreadcrumbItem = { label: 'Admin', href: hrefs.admin() }

export const usersTrail = (): BreadcrumbItem[] => [ADMIN, { label: 'Users' }]

/** `gameTitle` set: a game's details are open, so "Games" becomes a link back to the list. */
export const gamesTrail = (gameTitle?: string | null): BreadcrumbItem[] =>
  gameTitle ? [ADMIN, { label: 'Games', href: hrefs.adminGames() }, { label: gameTitle }] : [ADMIN, { label: 'Games' }]

export const rankedTrail = (): BreadcrumbItem[] => [ADMIN, { label: 'Ranked queue' }]

export const minigolfReportsTrail = (): BreadcrumbItem[] => [ADMIN, { label: 'Course reports' }]

export const systemTrail = (): BreadcrumbItem[] => [ADMIN, { label: 'System' }]

export const dartSamplesTrail = (): BreadcrumbItem[] => [ADMIN, { label: 'Dart samples' }]

export const coachTrail = (): BreadcrumbItem[] => [ADMIN, { label: 'Coach sandbox' }]

export const cosmeticsTrail = (): BreadcrumbItem[] => [ADMIN, { label: 'Cosmetics' }]

/** `flagKey` set: a flag's details are open, so "Feature flags" becomes a link back to the list. */
export const flagsTrail = (flagKey?: string | null): BreadcrumbItem[] =>
  flagKey ? [ADMIN, { label: 'Feature flags', href: hrefs.adminFlags() }, { label: flagKey }] : [ADMIN, { label: 'Feature flags' }]

const PLAY: BreadcrumbItem = { label: 'Play', href: hrefs.play() }

/** `courseName` set: a course is open, so the courses crumb becomes a link back to the list. */
export const minigolfCoursesTrail = (courseName: string | null | undefined, area: Area = ADMIN_AREA): BreadcrumbItem[] => {
  const root = area.admin ? ADMIN : PLAY
  const label = area.admin ? 'Minigolf courses' : 'My courses'
  return courseName ? [root, { label, href: `#${area.base}/courses` }, { label: courseName }] : [root, { label }]
}

export const minigolfHoleTrail = (
  courseName: string | null,
  courseHref: string,
  holeName: string,
  area: Area = ADMIN_AREA,
): BreadcrumbItem[] => [
  area.admin ? ADMIN : PLAY,
  { label: area.admin ? 'Minigolf courses' : 'My courses', href: `#${area.base}/courses` },
  { label: courseName ?? 'Courses', href: courseHref },
  { label: holeName },
]

export const minigolfBenchTrail = (): BreadcrumbItem[] => [ADMIN, { label: 'Minigolf bench' }]
