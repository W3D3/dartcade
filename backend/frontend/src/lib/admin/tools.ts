import type { Component } from 'svelte'
import { Flag, Gamepad2, Map as MapIcon, Palette, Server, ToggleRight, Users } from '@lucide/svelte'

export type AdminTool = {
  href: string
  title: string
  desc: string
  icon: Component
  /** Moderators may use it too. */ moderator?: boolean
}

/** Every admin tool, shown as a card on the Admin hub (`#/admin`). */
export const ADMIN_TOOLS: AdminTool[] = [
  { href: '/admin/minigolf/courses', title: 'Minigolf courses', desc: 'Edit and publish the official courses', icon: MapIcon },
  { href: '/admin/minigolf', title: 'Minigolf bench', desc: 'Try shots and physics on any hole', icon: Flag },
  { href: '/admin/users', title: 'Users', desc: 'Search accounts and set their role', icon: Users },
  {
    href: '/admin/games',
    title: 'Games',
    desc: 'Every game on the platform, to investigate and invalidate',
    icon: Gamepad2,
    moderator: true,
  },
  { href: '/admin/cosmetics', title: 'Cosmetics', desc: 'Every reward in the game and how it unlocks', icon: Palette },
  { href: '/admin/flags', title: 'Feature flags', desc: 'Turn flags on or off at runtime', icon: ToggleRight },
  { href: '/admin/system', title: 'System', desc: 'Version, runtime, database and live connections', icon: Server },
]

/** The tools a user sees on the hub: all of them for an admin, the moderator ones for a moderator. */
export function toolsFor(user: { isAdmin: boolean } | null | undefined): AdminTool[] {
  if (!user) return []
  return user.isAdmin ? ADMIN_TOOLS : ADMIN_TOOLS.filter(t => t.moderator)
}
