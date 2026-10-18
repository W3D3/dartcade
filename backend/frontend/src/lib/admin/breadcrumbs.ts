// Breadcrumb trails for the admin pages, as plain data: each page renders it with
// $lib/components/ui/breadcrumb and wires any onclick it needs (e.g. an unsaved-changes guard).
import type { BreadcrumbItem } from '$lib/components/ui/breadcrumb/index.js'

const ADMIN: BreadcrumbItem = { label: 'Admin', href: '#/admin' }

export const usersTrail = (): BreadcrumbItem[] => [ADMIN, { label: 'Users' }]

export const systemTrail = (): BreadcrumbItem[] => [ADMIN, { label: 'System' }]

/** `flagKey` set: a flag's details are open, so "Feature flags" becomes a link back to the list. */
export const flagsTrail = (flagKey?: string | null): BreadcrumbItem[] =>
  flagKey ? [ADMIN, { label: 'Feature flags', href: '#/admin/flags' }, { label: flagKey }] : [ADMIN, { label: 'Feature flags' }]

/** `courseName` set: a course is open, so "Minigolf courses" becomes a link back to the list. */
export const minigolfCoursesTrail = (courseName?: string | null): BreadcrumbItem[] =>
  courseName
    ? [ADMIN, { label: 'Minigolf courses', href: '#/admin/minigolf/courses' }, { label: courseName }]
    : [ADMIN, { label: 'Minigolf courses' }]

export const minigolfHoleTrail = (courseName: string | null, courseHref: string, holeName: string): BreadcrumbItem[] => [
  ADMIN,
  { label: 'Minigolf courses', href: '#/admin/minigolf/courses' },
  { label: courseName ?? 'Courses', href: courseHref },
  { label: holeName },
]

export const minigolfBenchTrail = (): BreadcrumbItem[] => [ADMIN, { label: 'Minigolf bench' }]
