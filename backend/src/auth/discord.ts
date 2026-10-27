import type { DiscordOptions, DiscordProfile } from 'better-auth/social-providers'
import { cleanName } from '../users/names.js'

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

/** The Discord display name, else the username, cut to the name rules; nameHooks then makes it unique. */
export function discordName(profile: Pick<DiscordProfile, 'global_name' | 'username'>): string {
  for (const raw of [profile.global_name, profile.username]) {
    // cleanName falls back to "player" when too little of a name is left: try the username first
    const name = raw ? cleanName(raw) : ''
    if (name && name !== 'player') return name
  }
  return 'player'
}

/** better-auth's Discord provider (scopes identify and email, its defaults). */
export function discordProvider({ clientId, clientSecret }: NonNullable<DiscordConfig>): DiscordOptions {
  return {
    clientId,
    clientSecret,
    mapProfileToUser: profile => ({
      name: discordName(profile),
      // better-auth refuses a sign-in without an email; never call a stand-in address verified
      ...(profile.email ? {} : { email: placeholderEmail(profile.id), emailVerified: false }),
    }),
  }
}
