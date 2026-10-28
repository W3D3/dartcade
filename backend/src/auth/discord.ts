import type { DiscordOptions, DiscordProfile } from 'better-auth/social-providers'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { tryCleanName } from '../users/names.js'
import { suggestName } from '../users/account.js'

export type DiscordConfig = { clientId: string; clientSecret: string } | null

/** Sign in with Discord for this deployment, from env (see DEVELOPMENT.md); null when it's off. Throws when only one of the two is set. */
export function resolveDiscordConfig(env: Record<string, string | undefined>): DiscordConfig {
  const clientId = env.DISCORD_CLIENT_ID?.trim() || null
  const clientSecret = env.DISCORD_CLIENT_SECRET?.trim() || null
  if (!clientId && !clientSecret) return null
  if (!clientId || !clientSecret) throw new Error('Sign in with Discord needs both DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET')
  return { clientId, clientSecret }
}

/** Where a Discord account without an email (phone-only) gets its unique stand-in address; RFC 2606's .invalid never receives mail. */
export const placeholderEmail = (discordId: string) => `${discordId}@discord.invalid`

/** The Discord display name, else the username, cut to the name rules. */
export function discordName(profile: Pick<DiscordProfile, 'global_name' | 'username'>): string {
  return tryCleanName(profile.global_name ?? '') ?? tryCleanName(profile.username) ?? 'player'
}

/** better-auth's Discord provider (scopes identify and email, its defaults). */
export function discordProvider({ clientId, clientSecret }: NonNullable<DiscordConfig>, db: Kysely<Database>): DiscordOptions {
  return {
    clientId,
    clientSecret,
    mapProfileToUser: async profile => ({
      // Nobody typed it, so it's numbered when taken instead of refused (nameHooks still checks it)
      name: await suggestName(db, discordName(profile), null),
      // better-auth refuses a sign-in without an email; never call a stand-in address verified
      ...(profile.email ? {} : { email: placeholderEmail(profile.id), emailVerified: false }),
    }),
  }
}
