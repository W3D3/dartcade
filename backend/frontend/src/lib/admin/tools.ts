import type { Component } from 'svelte'
import { Flag, Map as MapIcon } from '@lucide/svelte'

export type AdminTool = { href: string; title: string; desc: string; icon: Component }

/** Every admin tool, shown as a card on the Admin hub (`#/admin`). */
export const ADMIN_TOOLS: AdminTool[] = [
  { href: '/admin/minigolf/courses', title: 'Minigolf courses', desc: 'Edit and publish the official courses', icon: MapIcon },
  { href: '/admin/minigolf', title: 'Minigolf bench', desc: 'Try shots and physics on any hole', icon: Flag },
]
