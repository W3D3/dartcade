// Banned accounts (admins only). Each ban has one public category; everyone sees its line, never
// the admin's own note. Shared by the backend (profile, sign-in) and the frontend (ban dialog, notices).

/** Category → the one line everyone sees. `user.banReason` stores the category id. */
export const BAN_CATEGORIES = {
  cheating: 'Closed for cheating',
  trolling: 'Closed for unsportsmanlike behaviour',
  spamming: 'Closed for spamming',
  harassment: 'Closed for abusive behaviour',
  other: 'Closed for breaking the fair play rules',
} as const

export type BanCategory = keyof typeof BAN_CATEGORIES

export const isBanCategory = (id: string): id is BanCategory => Object.hasOwn(BAN_CATEGORIES, id)

export const BAN_CATEGORY_IDS: readonly BanCategory[] = Object.keys(BAN_CATEGORIES).filter(isBanCategory)

/** What everyone may know about a ban: its category and when it ends (null: permanent). */
export type PublicBan = { category: BanCategory; until: Date | null }

/**
 * The ban in force on these `user` columns at `now`, or null. A timed ban past its expiry is over
 * (better-auth clears the columns at the next sign-in). A reason that isn't a category (a ban set
 * through better-auth's own endpoint) reads as `other`.
 */
export function activeBan(
  user: { banned: boolean | null; banReason: string | null; banExpires: Date | null },
  now = new Date(),
): PublicBan | null {
  if (!user.banned) return null
  if (user.banExpires && user.banExpires.getTime() <= now.getTime()) return null
  return { category: user.banReason && isBanCategory(user.banReason) ? user.banReason : 'other', until: user.banExpires }
}
