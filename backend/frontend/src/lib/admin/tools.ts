import type { Component } from 'svelte'
import {
  Flag,
  FlagTriangleRight,
  GraduationCap,
  Gamepad2,
  Map as MapIcon,
  Palette,
  ScanEye,
  Server,
  Swords,
  ToggleRight,
  Users,
} from '@lucide/svelte'

/** The hub's sections, in the order they are shown. */
export const ADMIN_CATEGORIES = ['People & moderation', 'Content & cosmetics', 'Platform & data', 'Labs'] as const
export type AdminCategory = (typeof ADMIN_CATEGORIES)[number]

export type AdminTool = {
  category: AdminCategory
  href: string
  title: string
  desc: string
  icon: Component
  /** Moderators may use it too. */ moderator?: boolean
}

/** Every admin tool, shown as a card on the Admin hub (`#/admin`). */
export const ADMIN_TOOLS: AdminTool[] = [
  {
    category: 'Content & cosmetics',
    href: '/admin/minigolf/courses',
    title: 'Minigolf courses',
    desc: 'Edit and publish the official courses',
    icon: MapIcon,
  },
  { category: 'Labs', href: '/admin/minigolf', title: 'Minigolf bench', desc: 'Try shots and physics on any hole', icon: Flag },
  { category: 'People & moderation', href: '/admin/users', title: 'Users', desc: 'Search accounts and set their role', icon: Users },
  {
    category: 'People & moderation',
    href: '/admin/games',
    title: 'Games',
    desc: 'Every game on the platform, to investigate and invalidate',
    icon: Gamepad2,
    moderator: true,
  },
  {
    category: 'People & moderation',
    href: '/admin/ranked',
    title: 'Ranked queue',
    desc: 'Who is searching for a ranked match, and take someone out',
    icon: Swords,
    moderator: true,
  },
  {
    category: 'People & moderation',
    href: '/admin/minigolf/reports',
    title: 'Course reports',
    desc: 'Reported player courses: unpublish, remove or dismiss',
    icon: FlagTriangleRight,
    moderator: true,
  },
  {
    category: 'Labs',
    href: '/admin/coach',
    title: 'Coach sandbox',
    desc: 'Throw a made-up visit and see what the coach says',
    icon: GraduationCap,
  },
  {
    category: 'Content & cosmetics',
    href: '/admin/cosmetics',
    title: 'Cosmetics',
    desc: 'Every reward in the game and how it unlocks',
    icon: Palette,
  },
  {
    category: 'Platform & data',
    href: '/admin/dart-samples',
    title: 'Dart samples',
    desc: 'Training data for the dart detection model, and its download',
    icon: ScanEye,
  },
  { category: 'Platform & data', href: '/admin/flags', title: 'Feature flags', desc: 'Turn flags on or off at runtime', icon: ToggleRight },
  {
    category: 'Platform & data',
    href: '/admin/system',
    title: 'System',
    desc: 'Version, runtime, database and live connections',
    icon: Server,
  },
]

/** The tools a user sees on the hub: all of them for an admin, the moderator ones for a moderator. */
export function toolsFor(user: { isAdmin: boolean } | null | undefined): AdminTool[] {
  if (!user) return []
  return user.isAdmin ? ADMIN_TOOLS : ADMIN_TOOLS.filter(t => t.moderator)
}

/** The tools a user sees, grouped under the hub's headings; a heading with no tool for them is left out. */
export function toolGroupsFor(user: { isAdmin: boolean } | null | undefined): { category: AdminCategory; tools: AdminTool[] }[] {
  const tools = toolsFor(user)
  return ADMIN_CATEGORIES.map(category => ({ category, tools: tools.filter(t => t.category === category) })).filter(g => g.tools.length > 0)
}
