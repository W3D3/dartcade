// A tournament's organizers (Tournament-Create's Organizers field, the organizer card, Add an
// organizer). Each request resolves with the server's reason when refused (null when done).
import { api } from '$lib/api'
import type { components } from '$lib/api/schema'
import { calendarDaysAgo } from '$lib/fmt'
import type { PickerPerson } from '$lib/teams/view'

export type Organizer = components['schemas']['TournamentOrganizers']['organizers'][number]
/** Someone picked to be an organizer. */
export type OrganizerPick = PickerPerson

/** What an organizer can do, as Add an organizer lists it (the owner-only part last). */
export const ORGANIZER_ABILITIES = [
  'Change all settings, the date and the format',
  'Add, rename and remove players and teams',
  'Send claim links and unlink claimed players',
  'Open tournament mode on devices logged in to their own account',
  'Start the tournament, run matches and correct results',
] as const

const reason = (res: { error?: { error: string } }): string | null => res.error?.error ?? null

/** The owner first, then the organizers; null when it failed. */
export async function loadOrganizers(id: string): Promise<Organizer[] | null> {
  try {
    return (await api.GET('/api/tournaments/{id}/organizers', { params: { path: { id } } })).data?.organizers ?? null
  } catch {
    return null
  }
}

export const addOrganizer = async (id: string, userId: string) =>
  reason(await api.POST('/api/tournaments/{id}/organizers', { params: { path: { id } }, body: { userId } }))

/** Removes an organizer, or steps down when it is you. */
export const removeOrganizer = async (id: string, userId: string) =>
  reason(await api.DELETE('/api/tournaments/{id}/organizers/{userId}', { params: { path: { id, userId } } }))

/** Adds each pick to a tournament just made; the reasons of those refused. */
export async function addPicked(id: string, picks: OrganizerPick[]): Promise<string[]> {
  const results = await Promise.all(picks.map(async p => [p.name, await addOrganizer(id, p.id)] as const))
  return results.flatMap(([name, error]) => (error ? [`Could not add ${name} as organizer: ${error}`] : []))
}

/** "Organizer · added 2 days ago". */
export function organizerLine(o: Pick<Organizer, 'role' | 'addedAt'>, now: Date): string {
  if (o.role === 'owner' || o.addedAt === null) return 'Owner'
  const ago = calendarDaysAgo(new Date(o.addedAt), now)
  return `Organizer · added ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`}`
}
