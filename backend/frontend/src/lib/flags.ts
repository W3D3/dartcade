// Feature flags in the SPA: OpenFeature's web SDK reading them from the backend over OFREP. The
// backend decides; the context set here (the user id) only makes the provider refetch when the
// signed-in user changes. Design: docs/superpowers/specs/2026-10-12-feature-flags-design.md
import { OpenFeature, ProviderEvents } from '@openfeature/web-sdk'
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider'
import { readable, type Readable } from 'svelte/store'

const contextOf = (userId: string | null) => ({ targetingKey: userId ?? 'anonymous' })

// Remembered so refreshFlags() can re-set the same context: OpenFeature.setContext always runs the
// provider's onContextChange, even when the context is unchanged, which makes it refetch now.
let currentUserId: string | null = null

/** Starts reading flags from the backend, for this user (null: signed out). Polls every 30s so an
 *  admin's runtime override reaches open tabs without a reload. */
export async function startFlags(userId: string | null): Promise<void> {
  currentUserId = userId
  await OpenFeature.setContext(contextOf(userId))
  await OpenFeature.setProviderAndWait(new OFREPWebProvider({ baseUrl: window.location.origin, pollInterval: 30_000 }))
}

/** The signed-in user changed (sign-in, sign-out, the dev user switch): the provider refetches. */
export async function setFlagUser(userId: string | null): Promise<void> {
  currentUserId = userId
  await OpenFeature.setContext(contextOf(userId))
}

/** Makes the provider refetch right away, e.g. right after an admin saves a flag override. */
export async function refreshFlags(): Promise<void> {
  await OpenFeature.setContext(contextOf(currentUserId))
}

/** A flag's value, kept up to date; `fallback` (off) until the flags have loaded. */
export function flag(key: string, fallback = false): Readable<boolean> {
  const client = OpenFeature.getClient()
  return watch(() => client.getBooleanValue(key, fallback))
}

/** A number flag's value (matchmaking.visitSeconds), kept up to date; `fallback` until the flags have loaded. */
export function numberFlag(key: string, fallback: number): Readable<number> {
  const client = OpenFeature.getClient()
  return watch(() => client.getNumberValue(key, fallback))
}

function watch<T>(read: () => T): Readable<T> {
  const client = OpenFeature.getClient()
  return readable(read(), set => {
    const update = () => set(read())
    const events = [ProviderEvents.Ready, ProviderEvents.ConfigurationChanged, ProviderEvents.ContextChanged]
    for (const e of events) client.addHandler(e, update)
    update()
    return () => {
      for (const e of events) client.removeHandler(e, update)
    }
  })
}
